use std::collections::{HashMap, HashSet};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

use futures_util::{SinkExt, StreamExt, TryFutureExt};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_stream::wrappers::UnboundedReceiverStream;
use uuid::Uuid;
use warp::http::header::{HeaderMap, HeaderValue};
use warp::ws::{Message, WebSocket};
use warp::Filter;

use crate::services::*;
use json_rpc2::{Request, Response};

use tracing_subscriber::fmt::format::FmtSpan;

/// Global unique connection id counter.
static CONNECTION_ID: AtomicUsize = AtomicUsize::new(1);

/// Error thrown by the server.
#[derive(Debug, Error)]
pub enum ServerError {
    /// Error generated when a directory is expected.
    #[error("{0} is not a directory")]
    NotDirectory(PathBuf),

    /// Error generated if party number is zero.
    #[error("party number may not be zero")]
    ZeroPartyNumber,

    /// Error generated if a party number is out of range.
    #[error("party number is out of range")]
    PartyNumberOutOfRange,

    /// Error generated if a party number already exists for a session.
    #[error("party number already exists for session {0}")]
    PartyNumberAlreadyExists(Uuid),

    /// Error generated parsing a socket address.
    #[error(transparent)]
    NetAddrParse(#[from] std::net::AddrParseError),

    /// Error generated by the `std::io` module.
    #[error(transparent)]
    Io(#[from] std::io::Error),

    /// Error generated by the JSON-RPC services.
    #[error(transparent)]
    JsonRpcError(#[from] json_rpc2::Error),
}

/// Result type for server errors.
pub type Result<T> = std::result::Result<T, ServerError>;

/// Parameters used during key generation and signing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameters {
    /// Number of parties `n`.
    pub parties: u16,
    /// Threshold for signing `t`.
    ///
    /// The threshold must be crossed (`t + 1`) for signing
    /// to commence.
    pub threshold: u16,
}

impl Default for Parameters {
    fn default() -> Self {
        return Self {
            parties: 3,
            threshold: 1,
        };
    }
}

/// Represents the type of session.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SessionKind {
    /// Key generation session.
    #[serde(rename = "keygen")]
    Keygen,
    /// Signing session.
    #[serde(rename = "sign")]
    Sign,
}

impl Default for SessionKind {
    fn default() -> Self {
        SessionKind::Keygen
    }
}

/// Group is a collection of connected websocket clients.
#[derive(Debug, Default, Clone, Serialize)]
pub struct Group {
    /// Unique identifier for the group.
    pub uuid: Uuid,
    /// Parameters for key generation.
    pub params: Parameters,
    /// Human-readable label for the group.
    pub label: String,
    /// Collection of client identifiers.
    #[serde(skip)]
    pub(crate) clients: Vec<usize>,
    /// Sessions belonging to this group.
    #[serde(skip)]
    pub(crate) sessions: HashMap<Uuid, Session>,
}

impl Group {
    /// Create a new group.
    ///
    /// The connection identifier `conn` becomes the initial client for the group.
    pub fn new(conn: usize, params: Parameters, label: String) -> Self {
        Self {
            uuid: Uuid::new_v4(),
            clients: vec![conn],
            sessions: Default::default(),
            params,
            label,
        }
    }
}

/// Session used for key generation or signing communication.
#[derive(Debug, Clone, Serialize)]
pub struct Session {
    /// Unique identifier for the session.
    pub uuid: Uuid,
    /// Kind of the session.
    pub kind: SessionKind,

    /// Map party number to connection identifier
    #[serde(skip)]
    pub(crate) party_signups: Vec<(u16, usize)>,

    /// Party numbers for those that have
    /// marked the session as finished.
    #[serde(skip)]
    pub(crate) finished: HashSet<u16>,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            uuid: Uuid::new_v4(),
            kind: Default::default(),
            party_signups: Default::default(),
            finished: Default::default(),
        }
    }
}

impl From<SessionKind> for Session {
    fn from(kind: SessionKind) -> Session {
        Self {
            uuid: Uuid::new_v4(),
            kind,
            party_signups: Default::default(),
            finished: Default::default(),
        }
    }
}

impl Session {
    /// Signup to a session.
    ///
    /// This marks a connected client as actively participating in
    /// this session and issues them a unique party signup number.
    pub fn signup(&mut self, conn: usize) -> u16 {
        let last = self.party_signups.last();
        let num = if last.is_none() {
            1
        } else {
            let (num, _) = last.unwrap();
            num + 1
        };
        self.party_signups.push((num, conn));
        num
    }

    /// Load an existing party signup number into this session.
    ///
    /// This is used when loading key shares that have been persisted
    /// to perform signing using the saved key shares.
    pub fn load(
        &mut self,
        parameters: &Parameters,
        conn: usize,
        party_number: u16,
    ) -> Result<()> {
        if party_number == 0 {
            return Err(ServerError::ZeroPartyNumber);
        }
        if party_number > parameters.parties {
            return Err(ServerError::PartyNumberOutOfRange);
        }
        if let Some(_) = self
            .party_signups
            .iter()
            .find(|(num, _)| num == &party_number)
        {
            return Err(ServerError::PartyNumberAlreadyExists(
                self.uuid.clone(),
            ));
        }
        self.party_signups.push((party_number, conn));
        Ok(())
    }
}

/// Collection of clients and groups managed by the server.
#[derive(Debug)]
pub struct State {
    /// Connected clients.
    pub clients: HashMap<usize, mpsc::UnboundedSender<Message>>,
    /// Groups keyed by unique identifier (UUID)
    pub groups: HashMap<Uuid, Group>,
    /// Notification to dispatch after sending response to client.
    pub notification: Option<Notification>,
}

/// Notification sent by the server to multiple connected clients.
#[derive(Debug)]
pub enum Notification {
    /// Indicates that the response should be ignored
    /// and no notification messages should be sent.
    ///
    /// This is used when testing a threshold for sending
    /// notifications; before a threshold has been reached
    /// we want to return a response but not actually send
    /// any notifications.
    Noop,

    /// Sends the response to all clients in the group.
    Group {
        /// The group identifier.
        group_id: Uuid,
        /// Ignore these clients.
        filter: Option<Vec<usize>>,
        /// Message to send to the clients.
        response: Response,
    },

    /// Sends the response to all clients in the session.
    Session {
        /// The group identifier.
        group_id: Uuid,
        /// The session identifier.
        session_id: Uuid,
        /// Ignore these clients.
        filter: Option<Vec<usize>>,
        /// Message to send to the clients.
        response: Response,
    },

    /// Relay messages to specific clients.
    ///
    /// Used for relaying peer to peer messages.
    Relay {
        /// Mapping of client connection identifiers to messages.
        messages: Vec<(usize, Response)>,
    },
}

impl Default for Notification {
    fn default() -> Self {
        Self::Noop
    }
}

/// MPC websocket server handling JSON-RPC requests.
pub struct Server;

impl Server {
    /// Start the server.
    ///
    /// The websocket endpoint is mounted at `path`,
    /// the server will bind to `addr` and static assets
    /// are served from `static_files`.
    ///
    /// Logs are emitted using the [tracing](https://docs.rs/tracing)
    /// library, in release mode the logs are formatted as JSON.
    pub async fn start(
        path: &'static str,
        addr: impl Into<SocketAddr>,
        static_files: Option<PathBuf>,
    ) -> Result<()> {
        // Filter traces based on the RUST_LOG env var.
        let filter = std::env::var("RUST_LOG").unwrap_or_else(|_| {
            "tracing=info,warp=debug,mpc_websocket=info".to_owned()
        });

        if cfg!(debug_assertions) {
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .with_span_events(FmtSpan::CLOSE)
                .init();
        } else {
            tracing_subscriber::fmt()
                .with_env_filter(filter)
                .with_span_events(FmtSpan::CLOSE)
                .json()
                .init();
        }

        let state = Arc::new(RwLock::new(State {
            clients: HashMap::new(),
            groups: Default::default(),
            notification: Default::default(),
        }));
        let state = warp::any().map(move || state.clone());

        let static_files = if let Some(static_files) = static_files {
            if static_files.is_absolute() {
                static_files
            } else {
                let cwd = std::env::current_dir()?;
                cwd.join(static_files)
            }
        } else {
            let mut static_files = std::env::current_dir()?;
            static_files.pop();
            static_files.push("client");
            static_files.push("dist");
            static_files
        };

        if !static_files.is_dir() {
            return Err(ServerError::NotDirectory(static_files));
        }

        let static_files = static_files.canonicalize()?;
        let static_path = static_files.to_string_lossy().into_owned();
        tracing::info!(%static_path);
        tracing::info!(path);

        let client = warp::any().and(warp::fs::dir(static_files));

        let mut headers = HeaderMap::new();
        headers.insert(
            "Cross-Origin-Embedder-Policy",
            HeaderValue::from_static("require-corp"),
        );
        headers.insert(
            "Cross-Origin-Opener-Policy",
            HeaderValue::from_static("same-origin"),
        );

        let websocket = warp::path(path).and(warp::ws()).and(state).map(
            |ws: warp::ws::Ws, state| {
                ws.on_upgrade(move |socket| client_connected(socket, state))
            },
        );

        let routes = websocket
            .or(client)
            .with(warp::reply::with::headers(headers))
            .with(warp::trace::request());

        warp::serve(routes).run(addr).await;
        Ok(())
    }
}

async fn client_connected(ws: WebSocket, state: Arc<RwLock<State>>) {
    let conn_id = CONNECTION_ID.fetch_add(1, Ordering::Relaxed);

    tracing::info!(conn_id, "connected");

    // Split the socket into a sender and receive of messages.
    let (mut user_ws_tx, mut user_ws_rx) = ws.split();

    // Use an unbounded channel to handle buffering and flushing of messages
    // to the websocket.
    let (tx, rx) = mpsc::unbounded_channel::<Message>();
    let mut rx = UnboundedReceiverStream::new(rx);

    let mut close_flag = Arc::new(RwLock::new(false));
    let should_close = Arc::clone(&close_flag);

    tokio::task::spawn(async move {
        while let Some(message) = rx.next().await {
            user_ws_tx
                .send(message)
                .unwrap_or_else(|e| {
                    tracing::error!(?e, "websocket send error");
                })
                .await;

            let reader = should_close.read().await;
            if *reader {
                match user_ws_tx.close().await {
                    Err(e) => tracing::warn!(?e, "failed to close websocket"),
                    _ => {}
                }
                break;
            }
        }
    });

    // Save the sender in our list of connected clients.
    state.write().await.clients.insert(conn_id, tx);

    // Handle incoming requests from clients
    while let Some(result) = user_ws_rx.next().await {
        let msg = match result {
            Ok(msg) => msg,
            Err(e) => {
                tracing::error!(conn_id, ?e, "websocket rx error");
                break;
            }
        };

        client_incoming_message(conn_id, &mut close_flag, msg, &state).await;
    }

    // user_ws_rx stream will keep processing as long as the user stays
    // connected. Once they disconnect, then...
    client_disconnected(conn_id, &state).await;
}

async fn client_incoming_message(
    conn_id: usize,
    close_flag: &mut Arc<RwLock<bool>>,
    msg: Message,
    state: &Arc<RwLock<State>>,
) {
    let msg = if let Ok(s) = msg.to_str() {
        s
    } else {
        return;
    };

    match json_rpc2::from_str(msg) {
        Ok(req) => rpc_request(conn_id, close_flag, req, state).await,
        Err(e) => tracing::warn!(conn_id, ?e, "websocket rx JSON error"),
    }
}

/// Process a request message from a client.
async fn rpc_request(
    conn_id: usize,
    close_flag: &mut Arc<RwLock<bool>>,
    request: Request,
    state: &Arc<RwLock<State>>,
) {
    use json_rpc2::futures::*;

    let service: Box<
        dyn Service<
            Data = (
                usize,
                Arc<RwLock<State>>,
                Arc<Mutex<Option<Notification>>>,
            ),
        >,
    > = Box::new(ServiceHandler {});
    let server = Server::new(vec![&service]);

    let notification: Arc<Mutex<Option<Notification>>> =
        Arc::new(Mutex::new(None));

    if let Some(response) = server
        .serve(
            &request,
            &(conn_id, Arc::clone(state), Arc::clone(&notification)),
        )
        .await
    {
        rpc_response(conn_id, &response, state).await;

        if let Some(error) = response.error() {
            if let Some(data) = &error.data {
                if data == CLOSE_CONNECTION {
                    let mut writer = close_flag.write().await;
                    *writer = true;
                }
            }
        }
    }

    let mut writer = notification.lock().await;
    if let Some(notification) = writer.take() {
        rpc_notify(state, notification).await;
    }
}

/// Remove `filters` from a list of clients.
fn filter_clients(
    clients: Vec<usize>,
    filter: Option<Vec<usize>>,
) -> Vec<usize> {
    if let Some(filter) = filter {
        clients
            .into_iter()
            .filter(|conn| filter.iter().find(|c| c == &conn).is_none())
            .collect::<Vec<_>>()
    } else {
        clients
    }
}

/// Send notification to connected client(s).
async fn rpc_notify(state: &Arc<RwLock<State>>, notification: Notification) {
    let reader = state.read().await;
    match notification {
        Notification::Group {
            group_id,
            filter,
            response,
        } => {
            let clients = if let Some(group) = reader.groups.get(&group_id) {
                group.clients.clone()
            } else {
                vec![0usize]
            };

            let clients = filter_clients(clients, filter);
            for conn_id in clients {
                rpc_response(conn_id, &response, state).await;
            }
        }
        Notification::Session {
            group_id,
            session_id,
            filter,
            response,
        } => {
            let clients = if let Some(group) = reader.groups.get(&group_id) {
                if let Some(session) = group.sessions.get(&session_id) {
                    session.party_signups.iter().map(|i| i.1.clone()).collect()
                } else {
                    tracing::warn!(
                        %session_id,
                        "notification session does not exist");
                    vec![0usize]
                }
            } else {
                vec![0usize]
            };

            let clients = filter_clients(clients, filter);
            for conn_id in clients {
                rpc_response(conn_id, &response, state).await;
            }
        }
        Notification::Relay { messages } => {
            for (conn_id, response) in messages {
                rpc_response(conn_id, &response, state).await;
            }
        }
        Notification::Noop => {}
    }
}

/// Send a message to a single client.
async fn rpc_response(
    conn_id: usize,
    response: &json_rpc2::Response,
    state: &Arc<RwLock<State>>,
) {
    tracing::debug!(conn_id, "send message");
    if let Some(tx) = state.read().await.clients.get(&conn_id) {
        tracing::debug!(?response, "send response");
        let msg = serde_json::to_string(response).unwrap();
        if let Err(_disconnected) = tx.send(Message::text(msg)) {
            // The tx is disconnected, our `client_disconnected` code
            // should be happening in another task, nothing more to
            // do here.
        }
    } else {
        tracing::warn!(conn_id, "could not find tx for websocket");
    }
}

async fn client_disconnected(conn_id: usize, state: &Arc<RwLock<State>>) {
    tracing::info!(conn_id, "disconnected");

    // FIXME: prune session party signups for disconnected clients?

    let mut empty_groups: Vec<Uuid> = Vec::new();
    {
        let mut writer = state.write().await;
        // Stream closed up, so remove from the client list
        writer.clients.remove(&conn_id);
        // Remove the connection from any client groups
        for (key, group) in writer.groups.iter_mut() {
            if let Some(index) =
                group.clients.iter().position(|x| *x == conn_id)
            {
                group.clients.remove(index);
            }

            // Group has no more connected clients so flag it for removal
            if group.clients.is_empty() {
                empty_groups.push(key.clone());
            }
        }
    }

    // Prune empty groups
    let mut writer = state.write().await;
    for key in empty_groups {
        writer.groups.remove(&key);
        tracing::info!(%key, "removed group");
    }
}
