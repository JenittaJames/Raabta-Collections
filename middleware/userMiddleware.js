const userModel = require("../models/userSchema");
const productModel = require("../models/productSchema");

const ifLogged = async (req, res, next) => {
  try {
    const user = await userModel.findOne({ _id: req.session.userId });
    console.log("user:", user);
    if (req.session.isAuth && user && user.status === true) {
      next();
    } else {
      req.session.isAuth = false;
      res.redirect("/login");
    }
  } catch (error) {
    console.log("error occured", error);
  }
};

const logged = async (req, res, next) => {
  try {
    if (req.session.isAuth) {
      res.redirect("/");
    } else {
      next();
    }
  } catch (error) {
    console.log("error form middleware", error);
  }
};

const checkProductStatus = async (req, res, next) => {
  try {
    const id = req.params.id;
    const product = await productModel.findOne({ _id: id });

    if (!product || !product.status) {
      return res.status(404).render("user/redirect", {
        message: "Product not available or has been blocked",
        redirectUrl: "/shop",
      });
    }
    next();
  } catch (error) {
    console.error("Error checking product status:", error);
    res.status(500).render("user/500", { error: "Internal Server Error" });
  }
};

module.exports = {
  ifLogged,
  checkProductStatus,
  logged
};
