const dotenv = require("dotenv");
dotenv.config();
module.exports = {
  httpPort: process.env.HTTP_PORT,
  host: process.env.DB_HOST,
  dbUser: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  limiterMax: process.env.LIMITER_MAX,
  hiveSqlServ: process.env.HIVE_SQL_SERVER,
  hiveSqlDb: process.env.HIVE_SQL_DB,
  hiveSqlUser: process.env.HIVE_SQL_USER,
  hiveSqlPw: process.env.HIVE_SQL_PASSWORD,
  pinmapplePostingKey: process.env.PINMAPPLE_POSTING,
};
