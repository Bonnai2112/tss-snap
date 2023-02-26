import React from "react";

import { Box, Stack, Typography } from "@mui/material";

import ConnexionCard from "./components/connexion-card";

const drawerWidth = 500;

export default function Connect() {
  return (
    <>
      <Box sx={{ display: 'flex' }}>
        <Box
          component="nav"
          sx={{
            width: { sm: drawerWidth },
            flexShrink: { sm: 0 },
          }}
          aria-label="mailbox folders"
        > </Box>

        <Box sx={{ padding: 10 }}>
          <Stack spacing={6}>
            <Typography variant="h1" component="div" gutterBottom>
              Welcome to Ekino Multi Party Computation Wallet (MPC)
            </Typography>
            <Typography variant="h5" component="div" gutterBottom>
              The most trusted decentralized custody protocol and collective asset management application.
            </Typography>
            <ConnexionCard />
          </Stack>
        </Box>

      </Box>
    </>
  );
}
