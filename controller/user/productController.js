const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");

const loadSingleproduct = async (req, res) => {
  try {
    const id = req.params.id;
    const product = await productModel.findOne({ _id: id, status: true });

    if (!product) {
      // Return a JSON response with an error status
      return res.status(404).json({ 
        error: true, 
        message: "Product not available or has been blocked",
        redirect: "/shop" 
      });
    }

    const relatedProduct = await productModel.find({
      category: product.category,
      _id: { $ne: id },
    });
    res.render("user/singleproduct", { product, relatedProduct });
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
