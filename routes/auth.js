'use strict';
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const axios = require('axios');

router.post('/login', async (req, res, next) => {
  const userName = req.body.username;
  const password = req.body.password;
  try {
    if (!userName || !password) {
      throw new Error('No fields provided');
    }
    const response = await axios({
      url: `${process.env.PROFILES_SERVICE}/${userName}`,
      method: 'GET',
      json: true
    });
    if (!response.data.success) throw new Error('Invalid login')
    const user = response.data;
    console.log(password, user.password);
    const isEqual = await bcrypt.compare(password, user.password);
    if (!isEqual) {
      throw new Error('Invalid password');
    }
    const access_token = jwt.sign({
      id: user.id,
      userName: user.user_name,
      role: user.role_id,
      banned: user.banned
    }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '3h' });
    const refresh_token = jwt.sign({
      userName: user.user_name
    }, process.env.REFRESH_TOKEN_SECRET);
    await req.con.execute("INSERT INTO sessions VALUES(null, ?, ?)", [refresh_token, user.user_name]);
    res.status(200).json({
      success: true,
      access_token,
      refresh_token
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
  req.con.end();
});

router.post('/logout', async (req, res, next) => {
  const refreshToken = req.body.refresh_token;
  try {
    if (!refreshToken) {
      throw new Error('No params');
    }
    await req.con.execute("DELETE FROM sessions WHERE refresh_token=?", [refreshToken]);
    res.status(200).json({
      message: "Logged out"
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
  req.con.end();
});

router.post('/logoutall', async (req, res, next) => {
  const userName = req.body.userName;
  try {
    if (!userName) {
      throw new Error('No params');
    }
    await req.con.execute("DELETE FROM sessions WHERE user_name=?", [userName]);
    res.status(200).json({
      message: "Logged out on all devices!"
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
  req.con.end();
});

router.get('/token', async (req, res, next) => {
  const refreshToken = req.body.refresh_token;
  try {
    if (!refreshToken) {
      throw new Error('No params');
    }
    const rtDecoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    if (!rtDecoded) {
      throw new Error('Bad refresh token');
    }
    const [session] = await req.con.execute("SELECT * FROM sessions WHERE refresh_token=?", [refreshToken]);
    if (session.length === 0) {
      const error = new Error('Bad refresh token');
      error.status = 400;
      return next(error);
    }
    const response = await axios({
      url: `${process.env.PROFILES_SERVICE}/${rtDecoded.userName}`,
      method: 'GET',
      json: true
    });
    const user = response.data;
    const access_token = jwt.sign({
      id: user.id,
      userName: user.user_name,
      role: user.role_id,
      banned: user.banned
    }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '3h' });
    res.json({
      access_token
    });
  } catch (err) {
    next(err);
  }
  req.con.end();
})

module.exports = router;