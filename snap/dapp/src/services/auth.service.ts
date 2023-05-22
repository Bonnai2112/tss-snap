import axios from "axios";
import { AppState } from "../types";

const API_URL = "http://localhost:5000/";

export const sendEmail = (email: string, redirectUrl: string) => {
  console.log("redirectUrl => ", redirectUrl)
  return axios
    .post(API_URL + "link", {
      email,
      redirectUrl
    })
};

export const getCurrentUser = () => {
  return JSON.parse(localStorage.getItem("user"));
};

export const getUserInfos = (email: string) => {
  localStorage.removeItem("user");
  return axios
    .get(API_URL + "user/userinfos?email=" + email, {
      headers: {
        //Authorization: "Bearer " + token, // set the Authorization header with the token
        "Content-Type": "application/json", // set the Content-Type header to application/json
      }
    }).then((response) => {
      if (response.data.nNemonic) {
        console.log("nmenic => ", response.data.nNemonic)
        localStorage.setItem("user", JSON.stringify(response.data));
      }
      return response.data;
    }).catch((error) => console.log(error))
};


export const getStateFromMagic = (email: string) => {
  return axios
    .get(API_URL + "user/getStates?email=" + email)
}

export const setStateFromMagic = (email: string, appstates: AppState) => {
  return axios
    .post(API_URL + "user/setStates?email=" + email, {
      appStatesInput: appstates
    })
}

export const isActiveUser = (email: string) => {
  return axios
    .get(API_URL + "user/isActive?email=" + email)
}

export const deactivateUser = (email: string) => {
  return axios
    .post(API_URL + "user/deactivate", {
      email
    })
}