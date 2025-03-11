const userModel = require("../models/userSchema");
const productModel = require("../models/productSchema")


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


const checkProductStatus = async (req, res, next) => {
  try {
    const id = req.params.id;
    const product = await productModel.findOne({ _id: id });
    
    if (!product || !product.status) {
      return res.status(404).render("user/redirect", {
        message: "Product not available or has been blocked",
        redirectUrl: "/shop"
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
};
