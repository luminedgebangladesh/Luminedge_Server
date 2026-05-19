const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
});

let db;
let connected = false;

async function connectDB() {
  if (connected && db) return db;
  await client.connect();
  db = client.db("luminedge");
  connected = true;
  console.log("✅ MongoDB connected.");
  return db;
}

function getCollections() {
  if (!db) throw new Error("Database not connected. Call connectDB() first.");
  return {
    usersCollection: db.collection("users"),
    coursesCollection: db.collection("courses"),
    schedulesCollection: db.collection("schedules"),
    bookingMockCollection: db.collection("bookingMock"),
  };
}

module.exports = { client, connectDB, getCollections };
