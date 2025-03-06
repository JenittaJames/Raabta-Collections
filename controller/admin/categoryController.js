const catModel = require("../../models/categorySchema")

const categoriesPage = async (req, res) => {
    try {
        const { query } = req.query;
        const searchQuery = query || "";
        
        const searchFilter = {};
        
        if (searchQuery) {
            searchFilter.$or = [
                { name: { $regex: searchQuery, $options: "i" } },
                { description: { $regex: searchQuery, $options: "i" } }
            ];
        }
        
        const page = parseInt(req.query.page) || 1; 
        const limit = 4; 
        const skip = (page - 1) * limit; 

        const totalCategory = await catModel.countDocuments(searchFilter); 
        const totalPages = Math.ceil(totalCategory / limit); 

        const categories = await catModel.find(searchFilter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render("admin/categories", {
            categories,
            searchQuery,
            currentPage: page,
            totalPages: totalPages
        });

    } catch (error) {
        console.log("categories page error", error);
        res.status(500).send("Internal Server Error");
    }
}


const addCategory = async (req,res) => {
    try {
        res.render("admin/addcategory")
    } catch (error) {
        console.log("Add category error");
    }
}


const addCategoryPost = async (req,res) => {
    try {
        const {name,description} = req.body

        const categoryExisting = await catModel.findOne({ 
            name: { $regex: new RegExp("^" + name + "$", "i") } 
        });

        if(categoryExisting){
            res.redirect("/admin/categories")
        }else{
            await catModel.create({ name: name, description: description});
            res.redirect("/admin/categories")
        }
    } catch (error) {
        console.log("category page error", error);
        res.status(500).send("Internal Server Error");
    }
}

const blockCategory = async (req,res) => {
    try {
        const id = req.params.categoryId;

        const category = await catModel.findById(id)

        console.log("category");

        const val = !category.status

        await catModel.updateOne({_id:id},{$set:{status: val}})

        res.redirect("/admin/categories")

    } catch (error) {
        console.log("category blocking error", error);
        res.status(500).send("Internal Server Error");
    }
}


const editCategory = async (req,res) => {
    try {
        const categoryId = req.params.categoryId;
        const category = await catModel.findOne({_id:categoryId})
        res.render("admin/editcategory",{category})
    } catch (error) {
        console.log("edit category error", error);
        res.status(500).send("Internal Server Error");
    }
}



const editCategoryPost = async (req, res) => {
    try {
        const { name, description } = req.body;
        const categoryId = req.params.id || req.body.id; // Try getting ID from both params and body

        console.log("Category ID:", categoryId); // Debugging

        if (!categoryId) {
            return res.status(400).send("Invalid Request: Category ID is missing");
        }

        const categoryExisting = await catModel.findById(categoryId);

        if (!categoryExisting) {
            return res.status(404).send("Category not found");
        }

        await catModel.updateOne(
            { _id: categoryId },
            { name: name, description: description }
        );

        res.redirect("/admin/categories");
    } catch (error) {
        console.error("Category page error:", error);
        res.status(500).send("Internal Server Error");
    }
};






module.exports = {
    categoriesPage,
    addCategory,
    addCategoryPost,
    blockCategory,
    editCategory,
    editCategoryPost,
}