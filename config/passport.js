const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const dotenv = require("dotenv")
dotenv.config();

// Passport session setup
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
            done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Google OAuth Strategy
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: 'http://localhost:3000/auth/google/callback',
            callbackURL : 'http://raabtacollections.online/auth/google/callback'
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Check if the user already exists in your database
                let user = await User.findOne({ googleId: profile.id });

                console.log("entering to the google controller");

                if (!user) {
                    // Create a new user if they don't exist
                    user = new User({
                        googleId: profile.id,
                        userName: profile.name.givenName,
                        email: profile.emails[0].value,
                    });
                    await user.save();
                    console.log("user...........",user);
                }

                done(null, user);
            } catch (err) {
                done(err, null);
            }
        }
    )
);




module.exports = passport