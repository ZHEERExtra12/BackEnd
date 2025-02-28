import express, { json } from "express"
import mysql from "mysql2"
import dotenv from "dotenv"
import jwt from "jsonwebtoken"
import cors from "cors"
import bcrypt from "bcryptjsheroku buildpacks:add heroku/python"
import cookieParser from "cookie-parser"
const app =express()
dotenv.config()
app.use(cors(
    {origin: "https://pharmacy-hewr.netlify.app",
        credentials: true
    }
))
app.use(cookieParser())
app.use(express.json())

const DB_HOST = process.env.DB_HOST
const DB_USER = process.env.DB_USER
const DB_PASSWORD = process.env.DB_PASSWORD
const jwt_secret = process.env.JWT_SECRET
const DB_NAME = process.env.DB_NAME

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
})

db.connect((err)=>{
    if(err) console.log("database couldn't connect");
    else{
        console.log("database connects")
    }
})

app.post("/register",async(req,res)=>{
    const {username, password,passwordAgain} = req.body

    if(!username || !password || !passwordAgain){
        return res.status(404).json({message:"نابێ خانەکان بەتاڵ بن"})
    }

    if(password != passwordAgain){
        return res.status(404).json({message:"ووشەی نهێنی وەکو یەک نیە "})
    }
    try{
        const select = "SELECT * FROM users WHERE username=?"
        const [rows] = await db.promise().query(select,[username])

        if(rows.length > 0) {
            return res.status(400).json({message:"ئەم بەکارهێنەرە بونی هەیە "})
        }

        const hashedPass = await bcrypt.hash(password,10)

        const insert = "INSERT INTO users (username,password) VALUES(?,?)"
        await db.promise().query(insert,[username,hashedPass])
        
        res.status(200).json({message:"سەرکەوتوو بوو"})

    }

    catch{
        res.status(500).json({message:"server erors"})
    }
})

app.post("/login", async(req,res)=>{
    const {username, password}=req.body

    if(!username || !password) return res.status(404).json({message:"نابێ خانەکان بەتاڵ بن"});

    try{
    const selectAcc = "SELECT * FROM users WHERE username=?"
   const [rows] = await db.promise().query(selectAcc,[username])

    if(rows.length===0) return res.status(400).json({message:"ئەم هەژمارە بونی نیە"});

    const isMatch  = await bcrypt.compare(password,rows[0].password)
    
    if(!isMatch){
        return res.status(404).json({message:"پاسوردەکە هەڵەیە"})
    }

    const token = jwt.sign({username},jwt_secret,{expiresIn:"1h"})
    res.cookie("token",token,{
        httpOnly:true,
        sameSite:"strict",
         secure: process.env.NODE_ENV === "production",
        maxAge:60*60*1000
    })

    res.status(200).json({message:"سەرکەرتوو بوو"})
    }
    catch{
        res.status(500).json({message:"SERVER ERROR"})

    }

})

app.get("/protected", (req,res)=>{
    const token = req.cookies.token

    if(!token){
        return res.status(401).json("unauthorized")
    }
    try{
        const decode = jwt.verify(token,jwt_secret)
        const username = decode.username
        req.username = username
        // console.log(username)
        res.status(200).json({message: "Authorized", username})
    }
    catch(err){
        console.log(err || "errors")
        res.status(500).json("server error")
    }
})

app.post("/logout",async(req,res)=>{
    // const {logoutBtn} = req.body
    try{
       await res.clearCookie("token",{
            httpOnly:true,
            sameSite:"strict",
            path:"/"
        })
        res.status(200).json({message:"succesfull"})
    }
   catch{
    console.log("eroor")
   }
})

app.get("/getusername",async(req,res)=>{
    const token = req.cookies.token
    try{
        const decode = await jwt.verify(token,jwt_secret)
        const username = decode.username
        res.status(200).json({
            username: username
        })
    }
    catch{
        console.log("jnjsdcn")
    }
})

app.post("/additon", async(req,res)=>{
    const { name, barcode, quantity, expiration, price, profitAdd } = req.body;

    const Inputs = [ name, barcode, quantity, expiration, price, profitAdd]

    if(Inputs.some(input => !input)){
      return  res.status(404).json({message:"نابێ هیچ خانەک بەتاڵ بێت"})
    }
    const insertItems = 
        "INSERT INTO items (name, barcode, quantity, expiration, price, profitAdd, finalPrice) VALUES (?, ?, ?, ?, ?, ?, ?)";

    try {
        await db.promise().query(insertItems, [name, barcode, quantity, expiration, price, profitAdd,(price+profitAdd)]);
        res.status(200).json({ successMessage: "سەرکەوتوبوو" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ errorMessage: "هەڵەیەک ڕویدا" });
    }

})



app.post("/barcode-scanning", async (req, res) => {
    try {
        let { barcodeInput } = req.body;
        if (!barcodeInput || typeof barcodeInput !== "string" || !barcodeInput.trim()) {
            return res.status(400).json({ message: "Invalid barcode" });
        }

        barcodeInput = barcodeInput.trim(); // Remove any extra spaces

        const query = "SELECT name, finalPrice, quantity,profitAdd FROM items WHERE barcode = ?";
        const [rows] = await db.promise().query(query, [barcodeInput]);

        if (rows.length === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

       const {name, finalPrice,profitAdd} = rows[0];

       const item = { barcode: barcodeInput, name, finalPrice, profitAdd ,quantity: 1 };
        rows[0].barcode = barcodeInput;
        
        res.json({item});
        
    } catch (error) {
        console.error("Database query error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/sell-item", async (req, res) => {
    

    try{
        const { itemSelected } = req.body;

        if (!Array.isArray(itemSelected) || itemSelected.length === 0) {
            return res.status(400).json({ message: "Invalid items array" });
        }

        let sumQuantity = 0;
        let total = 0;
        let sumProfit = 0;
        for (const item of itemSelected) {
            const { barcode, quantity, profit } = item; // Extract barcode and quantity

            // Fetch the current quantity from the database
            const [rows] = await db.promise().query("SELECT quantity FROM items WHERE barcode = ?", [barcode]);

            if (rows.length === 0) {
                return res.status(404).json({ message: `Item with barcode ${barcode} not found` });
            }

            const availableQuantity = rows[0].quantity;

            if (availableQuantity < quantity) {
                return res.status(400).json({ message: `Not enough quantity for barcode ${barcode}` });
            }

            const updatedQuantity = availableQuantity - quantity;

            
            const updateQuery = "UPDATE items SET quantity = ? WHERE barcode = ?";
            await db.promise().query(updateQuery, [updatedQuantity, barcode]);
            
            if(availableQuantity === 1){
                const deleteQuery = "DELETE FROM items WHERE barcode = ?";
                await db.promise().query(deleteQuery, [barcode]);
            }
           
            sumQuantity += quantity;
            total += quantity * item.finalPrice;
            sumProfit += Number(profit)

        }
        
        const getLatestProfit = "SELECT * FROM dailyprofit";
        const [rows] = await db.promise().query(getLatestProfit);
        const {quantity , totalPrice, profit} = rows[0];

        const finalQuantity = Number(quantity) + sumQuantity;
        const finalTotalPrice = Number(totalPrice) + total;
        const finalProfit = Number(profit) + sumProfit;

        const insertquery = "UPDATE dailyprofit SET quantity=? , totalPrice=? , profit=? WHERE id=1";
        await db.promise().query(insertquery, 
            [finalQuantity, finalTotalPrice, finalProfit]);

        
        //T@P.P$:s7eTD@Pi
       return res.status(200).json("success")
        
    }
    catch{
        console.log("error")
    }
});

app.get("/get-items", async (req, res) => {
    try{
        const getItemsQuery = "SELECT * FROM items";
        const [rows]= await db.promise().query(getItemsQuery);
        res.status(200).json(rows)
    }
    catch{
        console.log("error")
    }
})

app.get("/get-profit", async(req,res) => {
    try{
        const getProfitQuery = "SELECT * FROM dailyprofit";
        const [rows] = await db.promise().query(getProfitQuery);
        const {quantity , totalPrice, profit} = rows[0];
        const data = rows[0]
        res.status(200).json({data: data})
        
    }
    catch{
        console.log("error")
    }


})

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));