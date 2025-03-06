const express = require("express");
const router = express.Router();
const adminController = require("../controller/admin/adminController");
const categoryController = require("../controller/admin/categoryController")
const productController = require("../controller/admin/productController")
const orderController = require("../controller/admin/orderController")
const {adminAuth} = require("../middleware/adminMiddleware")
const multer = require("multer");

const upload = multer({ dest: './uploads' })




router.get("/",adminController.adminLogin);
router.post("/login",adminController.adminLoginPost);
router.get("/dashboard",adminAuth,adminController.loadDashboard);
router.get("/logout",adminAuth,adminController.adminLogout);
router.get("/users",adminAuth,adminController.usersPage)
router.get("/block/:userId",adminAuth,adminController.blockUser)

router.get("/categories",adminAuth,categoryController.categoriesPage)
router.get("/addcategory",adminAuth,categoryController.addCategory)
router.post("/addcategory",adminAuth,categoryController.addCategoryPost)
router.get("/addcategory",adminAuth,categoryController.addCategoryPost)
router.get("/blockcategory/:categoryId",adminAuth,categoryController.blockCategory);
router.get("/editcategory/:categoryId",adminAuth,categoryController.editCategory)
router.post("/editcategory/:categoryId",adminAuth,categoryController.editCategoryPost)


router.get("/product",adminAuth,productController.productPage)
router.get("/addproduct",adminAuth,productController.addProduct)
router.post("/addproduct",adminAuth,upload.array("images"),productController.addProductPost)
router.get("/blockproduct/:productId",adminAuth,productController.blockProduct)
router.get("/editproduct/:productId",adminAuth,productController.editProduct);
router.post("/editproduct/:productId",adminAuth,productController.editProductPost);
router.get("/editimage/:productId",adminAuth,productController.editImage);
router.post("/editimage/:productId",adminAuth,upload.array("images"),productController.editImagePost);


router.get("/orders", adminAuth, orderController.orders)
router.get('/orders/:orderId',adminAuth, orderController.orderDetails);
router.post('/orders/verify-return',adminAuth, orderController.verifyReturnRequest);



module.exports = router;