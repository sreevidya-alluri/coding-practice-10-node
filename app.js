const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({filename: dbPath, driver: sqlite3.Database})

    app.listen(3000, () => {
      console.log(`Server running at http://localhost:3000`)
    })
  } catch (e) {
    console.log(`DB Error:${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

// Function to convert DB state object to response object
const convertStateDbObjectToResponseObject = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}

// Function to convert DB district object to response object
const convertDistrictDbObjectToResponseObject = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

// Middleware for token authentication
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]
  if (!token) {
    return response.status(401).send('Invalid JWT Token')
  }
  jwt.verify(token, 'MY_SECRET_TOKEN', (error, payload) => {
    if (error) {
      return response.status(401).send('Invalid JWT Token')
    }
    request.user = payload
    next()
  })
}

// POST request for user login
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectedUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  try {
    const databaseUser = await db.get(selectedUserQuery)
    if (!databaseUser) {
      return response.status(400).send('Invalid user')
    }
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password,
    )
    if (isPasswordMatched) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      return response.send({jwtToken})
    } else {
      return response.status(400).send('Invalid password')
    }
  } catch (error) {
    console.error('Error during login:', error)
    return response.status(500).send('Internal Server Error')
  }
})

// GET request to retrieve all states
app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `SELECT * FROM state;`
  try {
    const statesArray = await db.all(getStatesQuery)
    const responseStates = statesArray.map(state =>
      convertStateDbObjectToResponseObject(state),
    )
    response.send(responseStates)
  } catch (error) {
    console.error('Error fetching states:', error)
    return response.status(500).send('Internal Server Error')
  }
})

// GET request to retrieve state details by stateId
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStatesQuery = `SELECT * FROM state WHERE state_id = ${stateId};`
  try {
    const state = await db.get(getStatesQuery)
    if (!state) {
      return response.status(404).send('State not found')
    }
    const responseState = convertStateDbObjectToResponseObject(state)
    response.send(responseState)
  } catch (error) {
    console.error('Error fetching state:', error)
    return response.status(500).send('Internal Server Error')
  }
})

// GET request to retrieve district details by districtId
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictsQuery = `SELECT * FROM district WHERE district_id = ${districtId};`
    try {
      const district = await db.get(getDistrictsQuery)
      if (!district) {
        return response.status(404).send('District not found')
      }
      const responseDistrict = convertDistrictDbObjectToResponseObject(district)
      response.send(responseDistrict)
    } catch (error) {
      console.error('Error fetching district:', error)
      return response.status(500).send('Internal Server Error')
    }
  },
)

// GET request to retrieve statistics of a specific state
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStatsQuery = `
    SELECT SUM(cases) AS totalCases, SUM(cured) AS totalCured, SUM(active) AS totalActive, SUM(deaths) AS totalDeaths
    FROM district
    WHERE state_id = ${stateId};
  `
    try {
      const stats = await db.get(getStatsQuery)
      if (!stats) {
        return response.status(404).send('Statistics not found for the state')
      }
      response.send(stats)
    } catch (error) {
      console.error('Error fetching state statistics:', error)
      return response.status(500).send('Internal Server Error')
    }
  },
)

// POST request to add a district
app.post('/districts/', authenticateToken, async (request, response) => {
  const {stateId, districtName, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `
    INSERT INTO district (state_id, district_name, cases, cured, active, deaths)
    VALUES (${stateId}, '${districtName}', ${cases}, ${cured}, ${active}, ${deaths});
  `
  try {
    await db.run(postDistrictQuery)
    return response.send('District Successfully Added')
  } catch (error) {
    console.error('Error adding district:', error)
    return response.status(500).send('Internal Server Error')
  }
})

// DELETE request to remove a district by districtId
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrictQuery = `DELETE FROM district WHERE district_id = ${districtId}`
    try {
      await db.run(deleteDistrictQuery)
      return response.send('District Removed')
    } catch (error) {
      console.error('Error removing district:', error)
      return response.status(500).send('Internal Server Error')
    }
  },
)

// PUT request to update district details by districtId
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistrictQuery = `
    UPDATE district
    SET district_name = '${districtName}', state_id = ${stateId}, cases = ${cases}, cured = ${cured}, active = ${active}, deaths = ${deaths}
    WHERE district_id = ${districtId};
  `
    try {
      await db.run(updateDistrictQuery)
      return response.send('District Details Updated')
    } catch (error) {
      console.error('Error updating district:', error)
      return response.status(500).send('Internal Server Error')
    }
  },
)

// Exporting the Express instance
module.exports = app
