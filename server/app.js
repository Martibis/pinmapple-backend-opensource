const express = require("express");
const app = express();
app.use(express.json());
const mysql = require("mysql");
const mssql = require("mssql");
const morgan = require("morgan");
const helmet = require("helmet");
const xss = require("xss-clean");
const bodyParser = require("body-parser");
const cron = require("node-cron");

const {
  httpPort,
  host,
  dbUser,
  password,
  database,
  limiterMax,
  hiveSqlServ,
  hiveSqlDb,
  hiveSqlUser,
  hiveSqlPw,
  pinmapplePostingKey,
} = require("./config");

var cors = require("cors");
app.use(cors());

const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: limiterMax, // limit each IP to 2000 requests per windowMs
});

app.use(limiter);
app.use(xss());
app.use(helmet());

let http = require("http").Server(app);

app.use(morgan("short"));

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

const mssqlConfig = {
  user: hiveSqlUser,
  password: hiveSqlPw,
  server: hiveSqlServ,
  database: hiveSqlDb,
  options: {
    encrypt: true,
    enableArithAbort: true,
  },
  trustServerCertificate: true,
};

const connection = mysql.createConnection({
  host: host,
  user: dbUser,
  password: password,
  database: database,
  multipleStatements: true,
  charset: "utf8mb4",
  flags: "-FOUND_ROWS",
});

const dhive = require("@hiveio/dhive");

const hiveClient = new dhive.Client([
  "https://api.hive.blog",
  "https://anyx.io",
  "https://api.openhive.network",
]);
const postingKey = dhive.PrivateKey.fromString(pinmapplePostingKey);

let cronRunning = false;

cron.schedule("0 */10 * * * *", async () => {
  if (cronRunning) {
    return;
  }
  cronRunning = true;
  var ourDate = new Date();

  //Change it so that it is 7 days in the past.
  var pastDate = ourDate.getDate() - 8;
  ourDate.setDate(pastDate);
  let timestamp = ourDate.toISOString();
  await autoCommentHiveSql(timestamp);
  cronRunning = false;
});

async function autoCommentHiveSql(timestamp) {
  await (async function () {
    try {
      let pool = await mssql.connect(mssqlConfig);
      let res = await pool
        .request()
        .query(
          "SELECT id, curator_payout_value, total_payout_value, total_pending_payout_value, pending_payout_value, author_rewards, json_metadata, title, net_votes, category, permlink, parent_permlink, author, created, url, body FROM Comments WHERE depth = 0 AND title != '' AND CONTAINS(body, 'pinmapple') AND CONTAINS(body, 'd3scr') AND created > '" +
            timestamp +
            "' ORDER BY created DESC"
        );
      let posts = res.recordsets[0];
      console.log(posts.length);
      let reg =
        /!pinmapple -*[0-9]+\.*[0-9]* lat -*[0-9]+\.*[0-9]* long.*?d3scr/g;
      for (let i = 0; i < posts.length; i++) {
        if (posts[i].body.match(reg)) {
          let p = posts[i];
          let code = p.body.match(reg)[0];
          let lat = code.split("!pinmapple")[1].split("lat")[0];
          let long = code.split("lat")[1].split("long")[0];
          let descr = code.split("long")[1].split("d3scr")[0];

          let category = p.category;
          let permlink = p.permlink;
          let author = p.author;

          let postlink = "https://peakd.com" + p.url;
          let posttitle = p.title;

          let postimg;
          let json_metadata = JSON.parse(p.json_metadata);
          if (
            json_metadata != undefined &&
            json_metadata != null &&
            json_metadata != "" &&
            json_metadata != []
          ) {
            if (
              json_metadata.image != undefined &&
              json_metadata.image != null &&
              json_metadata.image != "" &&
              json_metadata.image != []
            ) {
              if (
                json_metadata.image[0] != undefined &&
                json_metadata.image[0] != null &&
                json_metadata.image[0] != ""
              ) {
                postimg = json_metadata.image[0];
              } else {
                let imgreg = /src=['"]+.*?['"]+/g;
                if (p.body.match(imgreg)) {
                  postimg = p.body.match(imgreg)[0];
                } else {
                  postimg = "No image";
                }
              }
            } else {
              let imgreg = /src=['"]+.*?['"]+/g;
              if (p.body.match(imgreg)) {
                postimg = p.body.match(imgreg)[0];
              } else {
                postimg = "No image";
              }
            }
          } else {
            let imgreg = /src=['"]+.*?['"]+/g;
            if (p.body.match(imgreg)) {
              postimg = p.body.match(imgreg)[0];
            } else {
              postimg = "No image";
            }
          }

          let postupvote = p.net_votes;
          let postvalue = p.pending_payout_value;
          if (postvalue == 0) {
            postvalue = p.total_payout_value + p.curator_payout_value;
          }
          postvalue = postvalue.toFixed(3);
          let postdate = p.created.toISOString().slice(0, 19).replace("T", " ");
          let tags = "";
          let res2 = await pool
            .request()
            .query("SELECT tag FROM Tags WHERE comment_id = " + p.id + "");
          let tagsRes = res2.recordsets[0];
          for (let j = 0; j < tagsRes.length; j++) {
            tags = tags + tagsRes[j].tag.toString() + ", ";
          }

          let postbody = p.body;
          var promiseToWait = new Promise(function (resolve, reject) {
            if (
              postvalue > 0.02 &&
              lat != 0 &&
              long != 0 &&
              lat != undefined &&
              long != undefined
            ) {
              //IGNORE OR DELETE FROM DB
              //CREATE OR UPDATE
              const queryString =
                "INSERT INTO markerinfo (postLink, username, postTitle, longitude, lattitude, postDescription, postPermLink, postDate, tags, postUpvote, postValue, postImageLink, postBody) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE postTitle = ?, longitude = ?, lattitude = ?, postDescription = ?, tags= ?, postUpvote= ?, postValue= ?, postImageLink= ?, postBody= ?";
              connection.query(
                queryString,
                [
                  postlink.toString(),
                  author.toString(),
                  posttitle.toString(),
                  long.toString(),
                  lat.toString(),
                  descr.toString(),
                  permlink.toString(),
                  postdate.toString(),
                  tags.toString(),
                  postupvote.toString(),
                  postvalue.toString(),
                  postimg.toString(),
                  postbody.toString(),
                  posttitle.toString(),
                  long.toString(),
                  lat.toString(),
                  descr.toString(),
                  tags.toString(),
                  postupvote.toString(),
                  postvalue.toString(),
                  postimg.toString(),
                  postbody.toString(),
                ],
                async (err5, res5, fields5) => {
                  if (err5) {
                    console.log(err5);
                  } else {
                    //EXTRA CHECK NEEDED AS HIVESQL SOMETIMES NEEDS SOME TIME TO UPDATE
                    const queryStringTwo =
                      "SELECT isCommented FROM markerinfo WHERE username = ? AND postPermLink = ? LIMIT 1";
                    connection.query(
                      queryStringTwo,
                      [author.toString(), permlink.toString()],
                      async (err3, res3, fields2) => {
                        if (err3) {
                          console.log(err3);
                          resolve();
                        } else {
                          if (res3[0].isCommented == 0) {
                            await makeComment(author, permlink);
                            await wait(10000);
                            resolve();
                          } else {
                            resolve();
                          }
                        }
                      }
                    );
                  }
                }
              );
            }
            //AUTOMATICALLY DELETE SPAM (DOWNVOTED TO 0)
            else {
              const queryString = "DELETE FROM markerinfo WHERE postLink = ?";
              connection.query(
                queryString,
                [postlink.toString()],
                (err5, res5, fields5) => {
                  if (err5) {
                    console.log(err5);
                    resolve();
                  } else {
                    resolve();
                  }
                }
              );
            }
          });
          await promiseToWait;
        }
      }
    } catch (err) {
      // ... error checks
      console.log(err);
    }
  })();
  //console.log(toDoPosts.length);

  mssql.on("error", (err) => {
    // ... error handler
  });
}

//BROADCAST SUCCESFULLY PINNED COMMENT TO CHAIN
async function makeComment(pa, ppl) {
  let cBody =
    '<b>Congratulations, your post has been added to <a href="https://pinmapple.com">Pinmapple</a>! 🎉🥳🍍</b><br/><br>Did you know you have <b><a href="https://pinmapple.com/@' +
    pa +
    '" target="_blank">your own profile map</a></b>?<br>And every <b><a href="https://pinmapple.com?post=' +
    ppl +
    '" target="_blank">post has their own map</a></b> too!<br/><br/><b>Want to have your post on the map too?</b><br/><ul><li>Go to <b><a href="https://www.pinmapple.com">Pinmapple</a></b></li><li>Click the <b>get code</b> button</li><li>Click on the map where your post should be (zoom in if needed)</li><li>Copy and paste the generated code in your post (Hive only)</li><li>Congrats, your post is now on the map!</li></ul><a href="https://peakd.com/@pinmapple" target="_blank"><img src="https://pinmapple.com/IMG/smallestfineapple.png"/></a>';
  let now = new Date();
  const comment = {
    author: "pinmapple",
    title: "",
    body: cBody,
    parent_author: pa,
    parent_permlink: ppl,
    permlink:
      "pinmapple" +
      now.getTime().toString() +
      Math.floor(Math.random() * 100).toString(),
    json_metadata: "",
  };
  try {
    const { id } = await hiveClient.broadcast.comment(comment, postingKey);
    console.log(`Transaction ID: ${id}`);

    const queryStringTwo =
      "UPDATE markerinfo SET isCommented = 1 WHERE username = ? AND postPermLink = ?";
    connection.query(
      queryStringTwo,
      [pa.toString(), ppl.toString()],
      async (err3, res3, fields2) => {
        if (err3) {
          console.log(err3);
        } else {
          console.log("Updated iscommented in DB");
        }
      }
    );

    let tx = null;

    do {
      tx = await hiveClient.transaction.findTransaction(id);
      console.log(`Transaction status: ${tx.status}`);
      await wait(1000);
    } while (tx.status == "within_mempool");

    if (tx.status == "within_reversible_block") {
      console.log("Transaction confirmed");
    } else {
      //SOMETHING WENT WRONG
      console.log(`Transaction status: ${tx.status}`);
      const queryStringTwo =
        "UPDATE markerinfo SET isCommented = 0 WHERE username = ? AND postPermLink = ?";
      connection.query(
        queryStringTwo,
        [pa.toString(), ppl.toString()],
        async (err3, res3, fields2) => {
          if (err3) {
            console.log(err3);
          } else {
            console.log("Updated iscommented in DB");
          }
        }
      );
    }
  } catch (err) {
    console.error(err);
  }
}
async function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

app.get("/", (req, res) => {
  res.send("And we are in Pinmapple!");
});

http.listen(httpPort, () => {
  console.log("Server is running on port " + httpPort);
});
