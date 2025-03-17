
const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const os = require("os");
const session = require("express-session");
dotenv.config();
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const multer = require("multer");
const passport = require("passport");
require("./config/passport");
const flash = require("connect-flash");
const nocache = require("nocache");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(cors());
app.use(bodyParser.json());


app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(flash())

app.use((req,res,next)=>{
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});


app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

app.use(express.static(path.join(os.homedir(), "Downloads")));

app.use(nocache());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname + ".jpeg");
  },
});

const upload = multer({ storage: storage });

app.post("/uploads", upload.array("files"), (req, res) => {
  console.log(req.files);
  console.log(req.body);
});

app.use(passport.initialize());
app.use(passport.session());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/public", express.static("public"));

app.use("/uploads", express.static("uploads"));

app.use("/", userRouter);
app.use("/admin", adminRouter);

const server = async (params) => {
  try {
    await db();
    app.listen(PORT, () => {
      console.log(`server is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.log("error occured while connectecting", error);
    process.exit(1);
  }
};

server();
