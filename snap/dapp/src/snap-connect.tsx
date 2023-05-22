import React, { useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import { useNavigate } from "react-router-dom"

import { Box, Button, Modal, Stack, Typography } from "@mui/material"

import { setSnackbar } from "./store/snackbars"

import { isActiveUser, sendEmail } from "./services/auth.service"

import { useLocation } from 'react-router-dom'

type RedirectHandler = () => void;

type SnapConnectProps = {
  redirect: string | RedirectHandler;
};

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
};

export default function SnapConnect(props: SnapConnectProps) {
  const { redirect } = props;
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [openModal, setOpenModal] = useState(false)
  const [isActive, setIsAcitive] = useState(Boolean);
  const location = useLocation();

  const completeUrl = location.pathname + location.search;

  const redirectUrl = typeof completeUrl === 'string' ? redirect : completeUrl


  async function handleConnect() {
    console.log("Connect to custom magic link");

    try {
      console.log("SnapConnect currentUser => ")

      if (isActive && typeof redirect === "string") {
        console.log("1er cas ")
        navigate(redirect);
      } else if (isActive && typeof redirect === "function") {
        console.log("2e cas ")
        redirect()
      } else {
        console.log("3e cas ")
        await sendEmail("magiclink.ekino@gmail.com", redirectUrl as string);
        setOpenModal(true);
      }

    } catch (e) {
      dispatch(
        setSnackbar({
          message: `Could not connect: ${e.message || ""}`,
          severity: "error",
        })
      );
    }
  }

  useEffect(() => {
    (async () => {
      const res = await isActiveUser("magiclink.ekino@gmail.com");
      setIsAcitive(res?.data);
      /* if (isActive && typeof redirect === "string") {
        navigate(redirect);
      } */
    })()
  }, [isActive]);

  return (
    <>
      <Stack spacing={2}>
        <Button variant="contained" color="success" onClick={() => handleConnect()}>
          Connect with magic link
        </Button>
      </Stack>
      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
      >
        <Box sx={style}>
          <Typography id="modal-modal-title" variant="h6" component="h2">
            Welcome
          </Typography>
          <Typography id="modal-modal-description" sx={{ mt: 2 }}>
           Check your e-mail please !
          </Typography>
        </Box>
      </Modal>
    </>
  );
}
