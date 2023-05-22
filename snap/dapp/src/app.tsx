import init from "@lavamoat/mpc-snap-wasm";
import { Web3ReactHooks, Web3ReactProvider } from "@web3-react/core";
import React, { useEffect, useMemo, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import {
  magicConnect,
  hooks as magicConnectHooks,
} from "./connectors/magicConnect";
import { metaMask, hooks as metaMaskHooks } from "./connectors/metaMask";
import { CookiesProvider } from 'react-cookie';

// Define an array of web3react connectors and their hooks
// This is simply  an example of how to setup multiple connectors
// The MagicConnect connector already supports connecting with MetaMask and WalletConnect using the Magic Connect Modal
const connectors: [MetaMask | MagicConnect, Web3ReactHooks][] = [
  [metaMask, metaMaskHooks],
  [magicConnect, magicConnectHooks],
];

import {
  AppBar,
  Box,
  Button,
  CssBaseline,
  Link,
  Stack,
  Typography
} from "@mui/material";


import { ThemeProvider, createTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

import ChainProvider from "./chain-provider";
import WebSocketProvider from "./websocket-provider";
import WorkerProvider, { webWorker } from "./worker";

import { MetaMask } from "@web3-react/metamask";
import { MagicConnect } from "web3-react-magic";
import About from "./about";
import Dialogs from "./dialogs";
import Home from "./home";
import { Create, Import, Join, Keys, ShowKey } from "./keys";
import { JoinSignSession, Message, Transaction } from "./keys/sign";
import NotFound from "./not-found";
import Snackbars from "./snackbars";
import { deactivateUser, isActiveUser } from "./services/auth.service";

type WorkerMessage = {
  data: { ready: boolean };
};

function MainAppBar() {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(Boolean)

  const logout = () => {
    deactivateUser("magiclink.ekino@gmail.com")
    navigate('/');
  };

  useEffect(() => {
    (async () => {
      const res = await isActiveUser("magiclink.ekino@gmail.com");
      setIsActive(res?.data);
    })()
  }, [isActive])

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ pl: 4, pr: 4, pt: 1, pb: 1 }}>
        <Stack direction="row" alignItems="center">
          <Stack direction="row" padding={1} spacing={2}>
            <Link href="#/">
              <img src="/images/ekino.png" width="32" />
            </Link>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              MPC Threshold Signatures
            </Typography>
          </Stack>

          <Box sx={{ flexGrow: 1 }} />

          {
            isActive ?
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="contained" color="success" onClick={() => logout()}>
                  Deconnect
                </Button>
              </Stack>
              : <></>

          }

        </Stack>
      </AppBar>
    </Box>
  );
}

function Content() {
  return (
    <Box padding={5}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/keys/create" element={<Create />} />
        <Route path="/keys/import" element={<Import />} />
        <Route path="/keys/join/:groupId/:sessionId" element={<Join />} />
        <Route path="/keys/:address" element={<ShowKey />} />
        <Route path="/keys" element={<Keys />} />
        <Route path="/keys/:address/sign/message" element={<Message />} />
        <Route
          path="/keys/:address/sign/join/:signingType/:groupId/:sessionId"
          element={<JoinSignSession />}
        />
        <Route
          path="/keys/:address/sign/transaction"
          element={<Transaction />}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Box>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  //const [provider, setProvider] = useState(null);

  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: prefersDarkMode ? "dark" : "light",
        },
      }),
    [prefersDarkMode]
  );

  useEffect(() => {
    const initialize = async () => {
      /* const provider = await detectEthereumProvider();
      setProvider(provider); */

      // Setup the wasm helpers that run on the main UI thread
      await init();

      // Now we are ready to render
      setReady(true);
    };

    // Wait for the worker webassembly to be ready
    const onWorkerReady = (msg: WorkerMessage) => {
      if (msg.data.ready) {
        webWorker.removeEventListener("message", onWorkerReady);
        initialize();
      }
    };

    webWorker.addEventListener("message", onWorkerReady);
  }, []);

  if (ready === false) {
    return null;
  }

  /* if (!provider) {
    return (
      <p>
        Failed to detect an ethereum provider, please install{" "}
        <a href="https://metamask.io/flask/">MetaMask Flask</a>
      </p>
    );
  }

  if (provider !== window.ethereum) {
    return (
      <p>
        The wallet provider is not correct, do you have multiple wallets
        installed?
      </p>
    );
  } */

  return (
    <ThemeProvider theme={theme}>
      <>
        <CssBaseline />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <WebSocketProvider>
            <WorkerProvider>
              <ChainProvider>
                <Web3ReactProvider connectors={connectors}>
                  <CookiesProvider>
                    <MainAppBar />
                    <Content />
                    <Dialogs />
                    <Snackbars />
                  </CookiesProvider>
                </Web3ReactProvider>
              </ChainProvider>
            </WorkerProvider>
          </WebSocketProvider>
        </div>
      </>
    </ThemeProvider>
  );
}
