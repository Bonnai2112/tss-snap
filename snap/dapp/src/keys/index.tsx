import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import {
  Button,
  List,
  ListItem,
  ListItemButton,
  Stack,
  Typography,
} from "@mui/material";

import { keysSelector } from "../store/keys";

import Create from "./create";
import Import from "./import";
import Join from "./join";
import ShowKey from "./show";

import { useLocation } from 'react-router-dom';
import PublicAddress from "../components/public-address";
import KeysLoader from "./loader";

import { getUserInfos } from "../services/auth.service";

import { Wallet, providers } from 'ethers';



function Keys() {

  const location = useLocation();
  const navigate = useNavigate();
  const { keyShares, loaded } = useSelector(keysSelector);
  const [wallet, setWallet] = useState({});
  const [provider, setProvider] = useState({});


  useEffect(() => {

    const retriveUserInfos = async () => {
      const searchParams = new URLSearchParams(location.search);
      const email = searchParams.get('email'); // retrieves query parameter 'email'
      const datas = await getUserInfos(email)
      const walletMnemonic = Wallet.fromMnemonic(datas?.nNemonic)
      setProvider(new providers.JsonRpcProvider("https://polygon.llamarpc.com"));
      setWallet(walletMnemonic.connect(provider))
    }
    retriveUserInfos()
  }, []);


  if (!loaded) {
    return (
      <Stack spacing={2}>
        <Typography variant="h3" component="div" gutterBottom>
          Keys
        </Typography>
        <KeysLoader />
      </Stack>
    );
  }

  const showKey = (address: string) => navigate(`/keys/${address}`);

  const view = keyShares.length > 0 ? (
    <List component="div" disablePadding>
      {keyShares.map((share) => {
        const [address, { label }] = share;
        return (
          <ListItem
            key={address}
            disablePadding
            component="div"
            sx={{ display: "block" }}
          >
            <ListItemButton onClick={() => showKey(address)}>
              <Stack>
                <Typography variant="subtitle2" component="div">
                  {label}
                </Typography>
                <PublicAddress address={address} abbreviate />
              </Stack>
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  ) : (
    <Typography variant="body1" component="div" gutterBottom>
      No key shares yet.
    </Typography>
  );


  return (
    <Stack spacing={2}>
      <Typography variant="h3" component="div" gutterBottom>
        Keys
      </Typography>
      {view}
      <Stack direction="row" spacing={2}>
        <Button variant="contained" href="#/keys/import">
          Import from keystore
        </Button>
        <Button variant="contained" href="#/keys/create">
          Create a new key
        </Button>
      </Stack>
    </Stack>
  );
}

export { Create, Import, Join, Keys, ShowKey };

