import axios from "axios";
import { error } from "console";

const API_URL = "http://localhost:5000/";

export const sendEmail = (email: string) => {
  return axios
    .post(API_URL + "link", {
      email
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
        localStorage.setItem("user", JSON.stringify(response.data));
      }
      return response.data;
    }).catch((error) => console.log(error))
};
