const express = require("express");
const router = express.Router();
const adminController = require("../controller/admin/adminController");
const categoryController = require("../controller/admin/categoryController")
const productController = require("../controller/admin/productController")
const orderController = require("../controller/admin/orderController")
const couponController = require("../controller/admin/couponController")
const {adminAuth} = require("../middleware/adminMiddleware")
const multer = require("multer");

const upload = multer({ dest: './uploads' })




router.get("/",adminController.adminLogin);
router.post("/login",adminController.adminLoginPost);
router.get("/dashboard",adminAuth,adminController.loadDashboard);
router.get("/logout",adminAuth,adminController.adminLogout);
router.get("/users",adminAuth,adminController.usersPage)
router.get("/block/:userId",adminAuth,adminController.blockUser)
router.post('/api/block/:userId',adminAuth, adminController.blockUserAjax);

router.get("/categories",adminAuth,categoryController.categoriesPage)
router.get("/addcategory",adminAuth,categoryController.addCategory)
router.post("/addcategory",adminAuth,categoryController.addCategoryPost)
router.get("/addcategory",adminAuth,categoryController.addCategoryPost)
router.get("/blockcategory/:categoryId",adminAuth,categoryController.blockCategory);
router.get("/editcategory/:categoryId",adminAuth,categoryController.editCategory)
router.post("/editcategory/:categoryId",adminAuth,categoryController.editCategoryPost)
router.put('/api/blockcategory/:categoryId',adminAuth, categoryController.blockCategoryApi);


router.get("/product",adminAuth,productController.productPage)
router.get("/addproduct",adminAuth,productController.addProduct)
router.post("/addproduct",adminAuth,upload.array("images"),productController.addProductPost)
router.get("/blockproduct/:productId",adminAuth,productController.blockProduct)
router.get("/editproduct/:productId",adminAuth,productController.editProduct);
router.post("/editproduct/:productId",adminAuth,productController.editProductPost);
router.get("/editimage/:productId",adminAuth,productController.editImage);
router.post("/editimage/:productId",adminAuth,upload.array("images"),productController.editImagePost);
router.post('/api/blockproduct/:productId', adminAuth, productController.blockProductAjax);


router.get("/orders", adminAuth, orderController.orders)
router.get('/orders/:orderId',adminAuth, orderController.orderDetails);
router.post('/orders/verify-return',adminAuth, orderController.verifyReturnRequest);
router.post('/orders/update-status',adminAuth, orderController.updateOrderStatus);
router.post('/orders/update-product-status', orderController.updateProductStatus);
router.post('/submit-return', adminAuth, orderController.submitReturnRequest);


router.get("/coupon",adminAuth, couponController.loadCoupon);
router.get("/addcoupon",adminAuth, couponController.addCoupon);
router.post("/addcoupon",adminAuth, couponController.addCouponPost)
router.get("/editcoupon/:id", adminAuth, couponController.editCoupon)
router.post("/editcoupon/:id", adminAuth, couponController.editCouponPost)
router.put('/api/blockcoupon/:id',adminAuth, couponController.toggleCouponStatus);


module.exports = router;