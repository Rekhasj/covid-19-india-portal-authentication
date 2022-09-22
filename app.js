const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

const logger = (request, response, next) => {
  console.log(request.query);
  next();
};
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        //console.log(payload);
        request.username = payload.username;
        next();
      }
    });
  }
};

//User Register API
app.post("/users/", async (request, response) => {
  const { username, name, password, gender, location } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender, location) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}',
          '${location}'
        )`;
    await db.run(createUserQuery);
    response.send(`User created successfully`);
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//User Login API 1
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// GET User Profile API
app.get("/profile/", authenticateToken, async (request, response) => {
  let { username } = request;
  console.log(username);
  const selectUserQuery = `
    SELECT * FROM user 
    WHERE username ='${username}';`;
  const userDetails = await db.get(selectUserQuery);
  response.send(userDetails);
});

const convertDBStateObjectToResponseObject = (DBObject) => {
  return {
    stateId: DBObject.state_id,
    stateName: DBObject.state_name,
    population: DBObject.population,
  };
};
const convertDBDistrictObjectToResponseObject = (DBObject) => {
  return {
    districtId: DBObject.district_id,
    districtName: DBObject.district_name,
    stateId: DBObject.state_id,
    cases: DBObject.cases,
    cured: DBObject.cured,
    active: DBObject.active,
    deaths: DBObject.deaths,
  };
};
//API 2
app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT * FROM 
    state
    ORDER BY state_id;`;
  const stateList = await db.all(getStatesQuery);
  response.send(
    stateList.map((eachstate) =>
      convertDBStateObjectToResponseObject(eachstate)
    )
  );
});
//API 3
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT * FROM
    state 
    WHERE state_id = ${stateId};`;
  const state = await db.get(getStateQuery);
  response.send(convertDBStateObjectToResponseObject(state));
});
//API 4
app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const addDistrictQuery = `
    INSERT INTO 
    district(district_name,state_id,cases,cured,active,deaths)
    VALUES 
    ('${districtName}',${stateId},${cases},${cured},${active},${deaths});`;
  const dbResponse = await db.run(addDistrictQuery);
  response.send("District Successfully Added");
});
//API 5
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getStateQuery = `
    SELECT * FROM
    district
    WHERE district_id = ${districtId};`;
    const district = await db.get(getStateQuery);
    response.send(convertDBDistrictObjectToResponseObject(district));
  }
);

//API 6
app.delete(
  "/districts/:districtId",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
DELETE FROM 
district 
WHERE district_id = ${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);
//API 7
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictDetails = `
    UPDATE district 
    SET 
    district_name ='${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active=${active},
    deaths=${deaths}
    WHERE district_id = ${districtId};`;
    await db.run(updateDistrictDetails);
    response.send("District Details Updated");
  }
);

//API 8
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStatusQuery = `
    SELECT 
    SUM(cases),
    SUM(cured),
    SUM(active),
    SUM(deaths)
    FROM district
    WHERE state_id =${stateId};`;
    const stats = await db.get(getStatusQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
