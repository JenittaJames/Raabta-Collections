const userModel = require("../models/userSchema");

const verifyUser = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
};


const ifLogged = async (req, res, next) => {
  try {
    if (req.session.isAuth) {
      next();
    } else {
      res.redirect("/login");
    }
  } catch (error) {
    console.log("error occured", error);
  }
};

module.exports = {
  verifyUser,
  ifLogged,
};
