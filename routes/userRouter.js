const express = require("express");
const router = express.Router();
const userController = require("../controller/user/userController");
const productController = require("../controller/user/productController");
const cartController = require("../controller/user/cartController");
const profileController = require("../controller/user/profileController");
const checkoutController = require("../controller/user/checkoutController");
const orderController = require("../controller/user/orderController");
const wishlistController = require("../controller/user/wishlistController")
const offerController = require("../controller/user/offerController")
const { checkProductStatus, ifLogged, logged, wishlistMiddleware} = require("../middleware/userMiddleware");
const passport = require("passport");



router.get("/pageNotFound", userController.pageNotFound);
router.get("/",wishlistMiddleware, userController.loadHomepage);
router.get("/home",wishlistMiddleware, userController.loadHomepage);
router.get("/register", userController.loadRegister);
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/register" }),
  (req, res) => {
    // User is available as req.user after successful authentication
    req.session.userId = req.user._id;
    req.session.email = req.user.email;
    req.session.isAuth = true;
    res.redirect("/");
  }
);


router.get("/logout", userController.logout);
router.post("/register",logged, userController.register);
router.get("/login",logged, userController.loadLogin);
router.post("/login", userController.login);
router.get("/otp", userController.loadOtpPage);
router.post("/otp", userController.loadLogin);
router.post("/resend-otp", userController.resendOtp);
router.get("/forgot", userController.loadForgot);
router.post("/forgot", userController.forgot);
router.get("/forgot-otp", userController.loadForgototp);
router.post("/forgot-otp", userController.loadResetPassword);
router.post("/verifyforgotpasswordotp", userController.verifyForgotPasswordOtp);
router.post("/verify-otp", userController.verifyOtp);
router.get("/reset-password", userController.loadResetPassword);
router.post("/reset-password", userController.resetPassword);


router.get("/shop",wishlistMiddleware, userController.loadShop);
router.get("/search",wishlistMiddleware,userController.loadShop)
router.get("/shopbyfilter/:categoryId", userController.shopByFilter)
router.get("/singleproduct/:id",wishlistMiddleware,checkProductStatus, productController.loadSingleproduct);


router.get("/cart", ifLogged, cartController.loadCart);
router.post("/addtocart/:productId", ifLogged, cartController.addCart);
router.get("/remove/:productId", ifLogged, cartController.removeCart);
router.post("/update-cart", ifLogged, cartController.updateCartQuantity);
router.get('/get-cart-totals',ifLogged, cartController.getCartTotals);
router.get('/get-cart-item',ifLogged, cartController.getCartItem);


router.get("/checkout", ifLogged, checkoutController.checkout);
router.get("/placingorder", ifLogged, checkoutController.placingOrder)
router.post('/apply-coupon', ifLogged, checkoutController.applyCoupon);
router.post('/remove-coupon', ifLogged, checkoutController.removeCoupon);
router.post("/apply-offer", ifLogged, checkoutController.applyOffer);
router.post("/remove-offer", ifLogged, checkoutController.removeOffer);
router.post("/create-order",ifLogged,checkoutController.createOrder)
router.post('/verify-payment', ifLogged, checkoutController.verifyPayment);
router.post('/select-address', ifLogged, checkoutController.selectAddress);


router.get("/profile", ifLogged, profileController.profile);
router.post("/updateprofile", ifLogged, profileController.updateProfile);
router.get("/createaddress", ifLogged, profileController.createAddress);
router.post("/address", ifLogged, profileController.addressPost);
router.post("/address/default/:id", ifLogged, profileController.setDefaultAddress);
router.get("/address", ifLogged, profileController.addressDetails);
router.get("/changepassword", ifLogged, profileController.changePassword);
router.post("/changepassword", ifLogged, profileController.changePasswordPost);
router.get('/walletHistory',ifLogged, profileController. walletHistory);
router.post('/orders/:orderId/return', ifLogged, profileController.requestReturn);
router.get('/address/edit/:id', ifLogged, profileController.editAddress);
router.post('/address/update/:id', ifLogged, profileController.updateAddress);
router.post('/address/delete/:id', ifLogged, profileController.deleteAddress);


router.get('/verify-email-update', ifLogged, profileController.verifyEmailUpdate);
router.post('/verify-email-otp', ifLogged, profileController.verifyEmailOtp);
router.post('/resend-email-otp', ifLogged, profileController.resendEmailOtp);


router.get("/orders", ifLogged, orderController.orders);
router.get("/orderdetails/:orderId", ifLogged, orderController.orderDetails);
router.get("/confirmorder", ifLogged, orderController.placeOrder)
router.post('/orders/:orderId/cancel', ifLogged, orderController.cancelOrder);
router.get('/orders/:orderId/invoice', ifLogged, orderController.generateInvoice);
router.get("/orderconfirmation/:orderId", ifLogged, orderController.orderConfirmation);
router.get('/get-wallet-balance', ifLogged, orderController.getWalletBalance);
router.post('/place-order-wallet', ifLogged, orderController.placeOrderWallet);
router.post('/save-failed-payment', ifLogged, orderController.saveFailedPayment)
router.post('/retry-payment', ifLogged, orderController.retryPayment)



router.get('/wishlist',ifLogged, wishlistController.loadWishlist);
router.post('/wishlist/add',ifLogged, wishlistController.addToWishlist);
router.post('/wishlist/remove',ifLogged, wishlistController.removeFromWishlist);
router.post('/wishlist/add-to-cart',ifLogged, wishlistController.addToCartFromWishlist);


router.get('/offers/product/:productId',ifLogged, offerController.getProductOffers);
router.get('/offers/category/:categoryId',ifLogged, offerController.getCategoryOffers);
router.get('/offers/referral',ifLogged, offerController.getReferralOffers);


module.exports = router;
