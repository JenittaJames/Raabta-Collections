const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");
const offerModel = require("../../models/offerSchema");

const loadSingleproduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await productModel.findById(productId).populate('category');

    if (!product) {
      return res.status(404).json({ 
        error: true, 
        message: "Product not available or has been blocked",
        redirect: "/shop" 
      });
    }

    const productOffers = await offerModel.find({
      status: true,
      offerType: 'product',
      productId: { $in: [productId] },
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).sort({ discount: -1 });

    const categoryOffers = await offerModel.find({
      status: true,
      offerType: 'category',
      categoryId: { $in: [product.category._id] }, 
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).sort({ discount: -1 });

    const allOffers = [...productOffers, ...categoryOffers];
    const bestOffer = allOffers.length > 0 ? 
      allOffers.reduce((max, offer) => offer.discount > max.discount ? offer : max) 
      : null;

    const discountedPrice = bestOffer ? 
      product.price - (product.price * bestOffer.discount / 100) 
      : product.price;

    const relatedProduct = await productModel.find({
      category: product.category,
      _id: { $ne: productId },
    });

    res.render("user/singleproduct", { 
      product, 
      relatedProduct,
      productOffers,
      categoryOffers,
      bestOffer,
      discountedPrice
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ 
      error: true, 
      message: "Internal Server Error",
      redirect: "/shop" 
    });
  }
};

module.exports = {
  loadSingleproduct,
};