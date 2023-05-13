import React, { useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import { useNavigate } from "react-router-dom"

import { Box, Button, Modal, Stack, Typography } from "@mui/material"

import { setSnackbar } from "./store/snackbars"

import { getCurrentUser, sendEmail } from "./services/auth.service"

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
  const [user, setuser ] = useState();

  async function handleConnect() {
    console.log("Connect to custom magic link");

    try {
      await sendEmail("magiclink.ekino@gmail.com");
      setOpenModal(true);

    } catch (e) {
      dispatch(
        setSnackbar({
          message: `Could not connect: ${e.message || ""}`,
          severity: "error",
        })
      );
    }
  }

  useEffect( () => {
    const currentUser = getCurrentUser();
    setuser(currentUser);
    if (user && typeof redirect === "string") {
      navigate(redirect);
    }

  }, [user]);

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
              Text in a modal
            </Typography>
            <Typography id="modal-modal-description" sx={{ mt: 2 }}>
              Duis mollis, est non commodo luctus, nisi erat porttitor ligula.
            </Typography>
          </Box>
        </Modal>
    </>
  );
}
