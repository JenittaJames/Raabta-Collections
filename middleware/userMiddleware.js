const userModel = require("../models/userSchema");
const productModel = require("../models/productSchema");

const ifLogged = async (req, res, next) => {
  try {
    const user = await userModel.findOne({ _id: req.session.userId });
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



const wishlistMiddleware = async (req, res, next) => {
  try {
    if (req.session.userId) {
      const user = await userModel.findById(req.session.userId).select('wishlist');
      
      const wishlistProductIds = user 
        ? user.wishlist.map(productId => productId.toString()) 
        : [];
      
      res.locals.wishlistProducts = wishlistProductIds;
    } else {
      res.locals.wishlistProducts = [];
    }
    
    next();
  } catch (error) {
    console.error('Error in wishlist middleware:', error);
    res.locals.wishlistProducts = []; 
    next();
  }
};


module.exports = {
  ifLogged,
  checkProductStatus,
  logged,
  wishlistMiddleware
};
