import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fileRoutes from "./routes/fileRouter";

dotenv.config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.use("/api", fileRoutes);

app.listen(port, () => {
  console.log(`✅ Backend API is running on http://localhost:${port}`);
});
