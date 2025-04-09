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



const blockProductAjax = async (req, res) => {
  try {
    const id = req.params.productId;

    const product = await productModel.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    
    const newStatus = !product.status;
    
    await productModel.updateOne({ _id: id }, { $set: { status: newStatus } });
    
    // Return the updated status
    return res.status(200).json({ 
      success: true, 
      status: newStatus, 
      message: `Product ${newStatus ? 'unblocked' : 'blocked'} successfully` 
    });
  } catch (error) {
    console.log("AJAX product blocking error", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

const editProduct = async (req, res) => {
  try {
    const productId = req.params.productId;
    const product = await productModel.findOne({ _id: productId });
    const categories = await catModel.find();
    res.render("admin/editproduct", { product, categories });
  } catch (error) {
    console.log("edit product error", error);
    res.status(500).send("Internal Server Error");
  }
};

const editProductPost = async (req, res) => {
  try {
    const productId = req.params.productId;
    const { name, description, price, stock, category } = req.body;

    const product = await productModel.findById(productId);
    const categories = await catModel.find();
    if (!product) {
      return res.redirect("/admin/products");
    }

    const existingProduct = await productModel.findOne({
      name,
      _id: { $ne: productId },
    });
    if (existingProduct) {
      return res.redirect("/admin/product");
    }

    product.name = name;
    product.description = description;
    product.price = price;
    product.totalStock = stock;
    product.category = category;

    await product.save();

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
  } catch (error) {
    console.log("edit image error", error);
    res.status(500).send("Internal Server Error");
  }
};

const editImagePost = async (req, res) => {
    try {
        const productId = req.params.productId;

        const imageIndices = req.body.imageIndices || [];
        const newImages = req.files.map(file => file.path);

        const product = await productModel.findById(productId);

        if (!product.productImage) {
            product.productImage = [];
        }

        for (let i = 0; i < newImages.length; i++) {
            const currentIndex = i;
            
            if (currentIndex < product.productImage.length) {
                product.productImage[currentIndex] = newImages[i];
            } else {
                product.productImage.push(newImages[i]);
            }
        }

        if (product.productImage.length > 3) {
            product.productImage = product.productImage.slice(0, 3);
        }

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
  blockProductAjax, 
  editProduct,
  editProductPost,
  editImage,
  editImagePost
};