// Helper functions for saving and loading the snap state data.
//
import { AppState } from "../types";
import snapId from "../snap-id";
import { getStateFromMagic, setStateFromMagic } from "../services/auth.service"

function getDefaultAppState(): AppState {
  return {
    keyShares: [],
    messageProofs: {},
    transactionReceipts: {},
  };
}

async function getState() {
  const res = await getStateFromMagic('magiclink.ekino@gmail.com');
  return res?.data
}

async function setState(value: AppState) {
  const res = await setStateFromMagic('magiclink.ekino@gmail.com', value);
  return res?.data
}

export async function loadStateData(): Promise<AppState> {
  const state: AppState = (await getState()) as AppState;
  console.log(state)
  if (state !== null) {
    return state;
  }
  // Treat no state as a default empty state object
  return getDefaultAppState();
}

export async function saveStateData(appState: AppState): Promise<void> {
  await setState(appState);
}

export async function clearStateData(): Promise<void> {
  await setState(getDefaultAppState());
}
