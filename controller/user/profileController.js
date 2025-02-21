

const profile = async (req,res) => {
    try {
        res.render('user/profile')
    } catch (error) {
        console.log("error occured");
    }
}


module.exports = {
    profile
}