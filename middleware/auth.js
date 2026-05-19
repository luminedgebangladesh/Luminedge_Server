const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token =
    req.cookies?.token ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function verifyAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: admins only" });
    }
    next();
  });
}

function verifyStaff(req, res, next) {
  verifyToken(req, res, () => {
    const allowed = ["admin", "bdm", "teacher"];
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ message: "Forbidden: staff only" });
    }
    next();
  });
}

module.exports = { verifyToken, verifyAdmin, verifyStaff };
