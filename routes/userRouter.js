const express = require("express");
const router = express.Router();
const userController = require("../controller/user/userController");
const productController = require("../controller/user/productController");
const cartController = require("../controller/user/cartController")
const profileController = require("../controller/user/profileController");
const {verifyUser,ifLogged} = require("../middleware/userMiddleware")
const passport = require("passport")



router.get("/pageNotFound",userController.pageNotFound);
router.get("/",userController.loadHomepage)
router.get("/home",userController.loadHomepage)
router.get("/register",userController.loadRegister)
router.get('/auth/google',passport.authenticate('google',{scope : ['profile','email']}))
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect : '/register'}),(req,res)=>{
    req.session.isAuth = true;
    res.redirect('/');
});
router.get('/logout',userController.logout)

router.post("/register",userController.register)
router.get("/login",userController.loadLogin)
router.post("/login",userController.login)
router.get("/otp",userController.loadOtpPage)
router.post("/otp",userController.loadLogin)
router.post("/resend-otp",userController.resendOtp)
router.get("/forgot",userController.loadForgot)
router.post("/forgot",userController.forgot)
router.get("/forgot-otp",userController.loadForgototp)
router.post("/forgot-otp",userController.loadResetPassword);
router.post('/verifyforgotpasswordotp',userController.verifyForgotPasswordOtp);
router.post("/verify-otp",userController.verifyOtp);
router.get('/reset-password',userController.loadResetPassword);
router.post('/reset-password',userController.resetPassword);


router.get("/shop",userController.loadShop)
router.get("/singleproduct/:id",productController.loadSingleproduct)


router.get('/cart',ifLogged,cartController.loadCart);
router.post("/addtocart/:productId",ifLogged,cartController.addCart);
router.get('/remove/:productId',ifLogged,cartController.removeCart)
router.post('/update-cart',ifLogged,cartController.updateCartQuantity);


router.get('/profile',ifLogged,profileController.profile)








module.exports = router;
