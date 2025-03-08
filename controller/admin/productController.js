const productModel = require("../../models/productSchema");
const catModel = require("../../models/categorySchema");

const productPage = async (req, res) => {
  try {
    const { query } = req.query;
    const searchQuery = query || "";
    
    const searchFilter = {};
    
    if (searchQuery) {
      searchFilter.$or = [
        { productName: { $regex: searchQuery, $options: "i" } },
        { description: { $regex: searchQuery, $options: "i" } }
      ];
    }
    
    const perPage = 10;
    const page = parseInt(req.query.page) || 1;
    
    const totalProducts = await productModel.countDocuments(searchFilter);
    const totalPages = Math.ceil(totalProducts / perPage);
    
    const products = await productModel
      .find(searchFilter)
      .populate("category", "name")
      .skip((page - 1) * perPage)
      .limit(perPage);
    
    
    res.render("admin/product", {
      products,
      searchQuery,
      currentPage: page,
      totalPages: totalPages,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Internal Server Error");
  }
};

const addProduct = async (req, res) => {
  try {
    const categoryData = await catModel.find();
    res.render("admin/addproduct", { categoryData });
  } catch (error) {
    console.log("Add product error", error);
  }
};

const addProductPost = async (req, res) => {
  try {

    const { name, description, category, price, stock } = req.body;
    const categoryData = await catModel.findOne({ name: category });

    const imagePath = req.files.map((val) => val.path);


    const product = new productModel({
      productName: name,
      description,
      category,
      price,
      totalStock: stock,
      productImage: imagePath,
    });


    await product.save();

    res.redirect("/admin/product");
  } catch (error) {
    console.error("Error add products:", error);
    res.status(500).send("Internal Server Error");
  }
};

const blockProduct = async (req, res) => {
  try {
    const id = req.params.productId;

    const product = await productModel.findById(id);


    const val = !product.status;

    await productModel.updateOne({ _id: id }, { $set: { status: val } });

    res.redirect("/admin/product");
  } catch (error) {
    console.log("product blocking error", error);
    res.status(500).send("Internal Server Error");
  }
};

const editProduct = async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await productModel.findOne({ _id: productId });
    res.render("admin/editproduct", { product });
  } catch (error) {
    console.log("edit product error", error);
    res.status(500).send("Internal Server Error");
  }
};

const editProductPost = async (req, res) => {
  try {
    const productId = req.params.productId;
    const { name, description, price, stock } = req.body;

    // Find the product by ID
    const product = await productModel.findById(productId);
    if (!product) {
      return res.redirect("/admin/products");
    }

    // Check if another product exists with the same name
    const existingProduct = await productModel.findOne({
      name,
      _id: { $ne: productId },
    });
    if (existingProduct) {
      return res.redirect("/admin/product");
    }

    // Update the product details
    product.name = name;
    product.description = description;
    product.price = price;
    product.totalStock = stock;

    await product.save();

    // Redirect to the product page after successful update
    res.redirect("/admin/product");
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const editImage = async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await productModel.findOne({ _id: productId });
    res.render("admin/editimage", { product });
  } catch (error) {}
};


const editImagePost = async (req, res) => {
    try {
        const productId = req.params.productId;

        // Get indices of the images being updated
        const imageIndices = req.body.imageIndices || [];
        const newImages = req.files.map(file => file.path);

        // Find the product
        const product = await productModel.findById(productId);

        // Initialize productImage array if it doesn't exist
        if (!product.productImage) {
            product.productImage = [];
        }

        // Handle image updates
        for (let i = 0; i < newImages.length; i++) {
            const currentIndex = i;
            
            // If the index exists in productImage array, replace it
            // Otherwise, add the new image
            if (currentIndex < product.productImage.length) {
                product.productImage[currentIndex] = newImages[i];
            } else {
                product.productImage.push(newImages[i]);
            }
        }

        // Ensure we don't exceed 3 images
        if (product.productImage.length > 3) {
            product.productImage = product.productImage.slice(0, 3);
        }

        // Save the updated product
        await product.save();

        res.redirect('/admin/editproduct/' + productId);
    } catch (error) {
        console.log('error occurred while updating the image from the admin side', error);
        res.render('admin/servererror');
    }
}

module.exports = {
  productPage,
  addProduct,
  addProductPost,
  blockProduct,
  editProduct,
  editProductPost,
  editImage,
  editImagePost
};
