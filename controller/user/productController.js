const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");

const loadSingleproduct = async (req, res) => {
  try {
    const id = req.params.id;
    const product = await productModel.findById(id);
    const relatedProduct = await productModel.find({
      category: product.category,
      _id: { $ne: id },
    });
    res.render("user/singleproduct", { product, relatedProduct });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  loadSingleproduct,
};
