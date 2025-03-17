const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");
const userModel = require("../../models/userSchema")
const cartModel = require("../../models/cartSchema");



const loadWishlist = async (req, res) => {
    try {
        const userId = req.session.userId;
        
        if (!userId) {
            return res.render("user/wishlist", { 
                wishlistDetails: [{ wishlistItems: [] }]
            });
        }
        const user = await userModel.findById(userId).populate({
            path: 'wishlist',
            model: 'Product'
        });
        
        if (!user) {
            return res.render("user/wishlist", { 
                wishlistDetails: [{ wishlistItems: [] }]
            });
        }
        const wishlistDetails = [{
            wishlistItems: user.wishlist.map(product => ({
                productId: product
            }))
        }];
        
        res.render("user/wishlist", { wishlistDetails });
    } catch (error) {
        console.log("Error occurred while rendering wishlist page", error);
        res.render("user/wishlist", { 
            wishlistDetails: [{ wishlistItems: [] }]
        });
    }
};


const addToWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        
        if (!req.session.userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Please login to add items to wishlist" 
            });
        }
        
        const user = await userModel.findById(req.session.userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }
        
        const product = await productModel.findById(productId);
        
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: "Product not found" 
            });
        }

        if (user.wishlist.includes(productId)) {
            return res.status(400).json({ 
                success: false, 
                message: "Product already in wishlist" 
            });
        }
        
        user.wishlist.push(productId);
        await user.save();
        
        res.status(200).json({ 
            success: true, 
            message: "Product added to wishlist successfully" 
        });
    } catch (error) {
        console.log("Error occurred while adding to wishlist", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to add product to wishlist" 
        });
    }
};



const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        
        if (!req.session.userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Please login to remove items from wishlist" 
            });
        }
        
        const user = await userModel.findById(req.session.userId);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }
        
        if (!user.wishlist.includes(productId)) {
            return res.status(400).json({ 
                success: false, 
                message: "Product not in wishlist" 
            });
        }
        
        user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
        await user.save();
        
        res.status(200).json({ 
            success: true, 
            message: "Product removed from wishlist successfully" 
        });
    } catch (error) {
        console.log("Error occurred while removing from wishlist", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to remove product from wishlist" 
        });
    }
};

// Add to cart from wishlist
const addToCartFromWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.session.userId; 
        const quantity = 1;
        const MAX_QUANTITY = 7;
        
        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Please login to add items to cart" 
            });
        }
        
        const product = await productModel.findOne({_id: productId, status: true});
        
        if (!product) {
            return res.status(404).json({ 
                message: "Product not found" 
            });
        }
        
        const category = await catModel.findById(product.category);
        if (!category || category.status === false) {
            return res.status(400).json({ 
                message: "This product's category is no longer available" 
            });
        }

        if (product.totalStock <= 0 || product.totalStock < quantity) {
            return res.status(400).json({ 
                message: "Out of stock" 
            });
        }

        let cart = await cartModel.findOne({ user: userId });
        if (!cart) {
            cart = new cartModel({
                user: userId,
                cartItem: [],
                cartTotal: 0,
            });
        }

        const existingItemIndex = cart.cartItem.findIndex(
            (item) => item.productId.toString() === productId.toString()
        );

        if (existingItemIndex > -1) {
            const newQuantity = cart.cartItem[existingItemIndex].quantity + quantity;

            if(newQuantity > MAX_QUANTITY) {
                return res.status(400).json({
                    message: `Maximum quantity per product is ${MAX_QUANTITY}`,
                });
            }

            if (newQuantity > product.totalStock) {
                return res.status(400).json({
                    message: `Only ${product.totalStock} items available in stock`,
                });
            }

            cart.cartItem[existingItemIndex].quantity = newQuantity;
            cart.cartItem[existingItemIndex].price = product.price;
            cart.cartItem[existingItemIndex].stock = product.totalStock;
            cart.cartItem[existingItemIndex].total = newQuantity * product.price;
        } else {
            const newItem = {
                productId: productId,
                quantity: quantity,
                price: product.price,
                stock: product.totalStock,
                total: quantity * product.price,
            };

            cart.cartItem.push(newItem);
        }

        cart.cartTotal = cart.cartItem.reduce((acc, item) => acc + item.total, 0);

        await cart.save();

        const user = await userModel.findById(userId);
        user.wishlist = user.wishlist.filter(id => id.toString() !== productId.toString());
        await user.save();
        
        return res.status(200).json({
            success: true,
            message: "Product added to cart and removed from wishlist"
        });
    } catch (error) {
        console.log("Error occurred while adding to cart from wishlist", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to add product to cart" 
        });
    }
};



module.exports = {
    loadWishlist,
    addToWishlist,
    removeFromWishlist,
    addToCartFromWishlist
}