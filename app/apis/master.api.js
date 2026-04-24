const router = require("express").Router();
const vendorRoutes = require("./vendor.api.js");
const customerRoutes = require('./customer.api.js')
const { Op } = require("sequelize");
const db = require("../models/index.js");
const {
  responseData,
  getFormattedDate,
  generateRefCode,
  decryptRefreshToken,
  encryptRefreshToken,
  randomstring,
  getDeviceHash,
  generateOTP,
} = require("../shared/utils/helper.js");
const { validatePhone } = require("../shared/utils/validation.js");
const { vendorMiddleware, customerMiddleware } = require("../middleware/auth.js");
const admin = require("../config/firebase.js");
const { ENV, testNumbers } = require("../config/globals.js");
const querystring = require("querystring");
const axios = require("axios");



router.get("/", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

router.post("/refresh-token", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const clientRefreshToken = req.headers["x-refresh-token"];
    const { fcmToken, device_id, platformName = "android" } = req.body;

    const deviceId = device_id || null;
    const platform = platformName || null;

    if (!authHeader || !clientRefreshToken) {
      return res.status(401).json(responseData("Unauthorized", {}, req, false));
    }

    const token = authHeader.split(" ")[1];
    const deviceHash = getDeviceHash(req);

    const session = await db.session.findOne({
      where: {
        user_token: token,
        device_hash: deviceHash,
        revoked_at: null,
      },
    });

    if (!session) {
      return res
        .status(401)
        .json(responseData("Session expired", {}, req, false));
    }

    if (new Date() > new Date(session.expires_at)) {
      await session.update({ revoked_at: new Date() });
      return res
        .status(401)
        .json(responseData("Session expired", {}, req, false));
    }

    const decryptedRefresh = decryptRefreshToken(
      JSON.parse(session.session_token)
    );

    if (decryptedRefresh !== clientRefreshToken) {
      return res
        .status(401)
        .json(responseData("Invalid refresh token", {}, req, false));
    }

    // role from session
    const identity = String(session.role || "").toUpperCase();

    console.log("Refresh token request for user_token:", token, "role:", identity);

    let userModel = null;
    let deviceModel = null;

    if (identity === "VENDOR") {
      userModel = db.vendor;
      deviceModel = db.vendor_device_fcm;
    } else if (identity === "CUSTOMER") {
      userModel = db.customer;
      deviceModel = db.customer_device_fcm;
    } else {
      return res
        .status(401)
        .json(responseData("Invalid session role", {}, req, false));
    }

    const newRefreshToken = randomstring(128);
    const encryptedNewRefresh = encryptRefreshToken(newRefreshToken);
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await session.update({
      session_token: JSON.stringify(encryptedNewRefresh),
      expires_at: newExpiry,
      last_used_at: new Date(),
    });

    const user = await userModel.findOne({
      where: { token, flag: 0 },
    });

    if (!user) {
      return res.status(401).json(responseData("Unauthorized", {}, req, false));
    }

    // FCM token sync for same device
    if (fcmToken && deviceId && deviceModel) {
      const deviceWhere =
        identity === "VENDOR"
          ? {
            vendor_token: token,
            device_id: deviceId,
          }
          : {
            customer_token: token,
            device_id: deviceId,
          };

      const existingDevice = await deviceModel.findOne({
        where: deviceWhere,
      });

      if (existingDevice) {
        await existingDevice.update({
          fcm_token: fcmToken,
          platform,
          contact: user.contact || existingDevice.contact || null,
        });

      } else {
        const createPayload =
          identity === "VENDOR"
            ? {
              token: randomstring(64),
              vendor_token: token,
              contact: user.contact || null,
              fcm_token: fcmToken,
              device_id: deviceId,
              platform,
            }
            : {
              token: randomstring(64),
              customer_token: token,
              contact: user.contact || null,
              fcm_token: fcmToken,
              device_id: deviceId,
              platform,
            };

        await deviceModel.create(createPayload);
      }
    }

    return res.status(200).json(
      responseData(
        "Silent login successful",
        {
          token,
          refreshToken: newRefreshToken,
          identity,
        },
        req,
        true
      )
    );
  } catch (err) {
    console.error("Refresh token error:", err);
    return res.status(401).json(responseData("Unauthorized", {}, req, false));
  }
});

router.post("/logout", [vendorMiddleware], async (req, res) => {
  try {
    const session = req.dbSession;
    const fcmToken = String(req.body.fcmToken || "").trim();

    await session.update({ revoked_at: new Date() });

    await req.user.update({
      access_token_revoked: true,
      refresh_token_revoked: true,
    });

    // Logout current device token only
    if (fcmToken) {
      await db.vendor_device_fcm.update(
        {
          flag: 1,
        },
        {
          where: {
            vendor_token: req.user.token,
            fcm_token: fcmToken,
          },
        }
      );
    }

    return res
      .status(200)
      .json(responseData("Logged out successfully", {}, req, true));
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json(responseData("Logout failed", {}, req, false));
  }
});

router.post("/customer/logout", [customerMiddleware], async (req, res) => {
  try {
    const session = req.dbSession;
    const fcmToken = String(req.body.fcmToken || "").trim();

    await session.update({ revoked_at: new Date() });

    await req.user.update({
      access_token_revoked: true,
      refresh_token_revoked: true,
    });

    // Logout current device token only
    if (fcmToken) {
      const result = await db.customer_device_fcm.update(
        {
          flag: 1,
        },
        {
          where: {
            customer_token: req.user.token,
            fcm_token: fcmToken,
          },
        }
      );
    }

    return res
      .status(200)
      .json(responseData("Logged out successfully", {}, req, true));
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json(responseData("Logout failed", {}, req, false));
  }
});

router.post("/verifyOtp", async (req, res) => {
  let transaction;

  try {
    const otp = req.body.otp?.trim();
    const role = req.body.identity?.trim()?.toLowerCase();
    const phone = req.body.phone?.trim();
    const refCode = req.body.referralCode?.trim();

    const fcmToken = req.body.fcmToken || null;
    const deviceId = req.body.device_id || null;
    const platform = req.body.platformName || "android";

    if (!["customer", "vendor"].includes(role)) {
      return res.status(401).json(responseData("Invalid role", {}, req, false));
    }

    if (!validatePhone(phone)) {
      return res
        .status(401)
        .json(responseData("Phone number invalid", {}, req, false));
    }

    const roleUpper = role.toUpperCase();

    const roleConfig = {
      vendor: {
        model: db.vendor,
        deviceModel: db.vendor_device_fcm,
        deviceTokenField: "vendor_token",
      },
      customer: {
        model: db.customer,
        deviceModel: db.customer_device_fcm,
        deviceTokenField: "customer_token",
      },
    };

    const { model: Model, deviceModel: DeviceModel, deviceTokenField } =
      roleConfig[role];

    transaction = await db.sequelize.transaction();

    const otpData = await db.otp.findOne({
      where: { contact: phone, flag: 0, role },
      order: [["id", "DESC"]],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!otpData) {
      await transaction.rollback();
      return res.status(403).json(responseData("OTP expired", {}, req, false));
    }

    const expireTime = Number(otpData.server_time) + 10 * 60 * 1000;

    if (Date.now() > expireTime) {
      await db.otp.update(
        { flag: 1 },
        { where: { contact: phone, role }, transaction }
      );

      await transaction.rollback();
      return res.status(403).json(responseData("OTP expired", {}, req, false));
    }

    if (otp !== otpData.otp) {
      await transaction.rollback();
      return res
        .status(401)
        .json(responseData("OTP does not match", {}, req, false));
    }

    await db.otp.update(
      { flag: 1 },
      { where: { id: otpData.id }, transaction }
    );

    let user = await Model.findOne({
      where: { contact: phone, flag: 0 },
      transaction,
    });

    let isNew = false;
    const userToken = user ? user.token : randomstring(64);

    if (!user) {
      user = await Model.create(
        {
          contact: phone,
          role: roleUpper,
          token: userToken,
          ip: req.ip,
          user_agent: req.get("User-Agent"),
        },
        { transaction }
      );

      isNew = true;
    }

    let userWallet = await db.wallet.findOne({
      where: {
        user_token: userToken,
        role: roleUpper,
        status: "ACTIVE",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!userWallet) {
      userWallet = await db.wallet.create(
        {
          token: randomstring(64),
          user_token: userToken,
          role: roleUpper,
          referral_balance: 0,
          wallet_balance: 0,
          total_balance: 0,
          currency: "INR",
          status: "ACTIVE",
        },
        { transaction }
      );
    }

    const creditReferralWallet = async ({
      userToken,
      userRole,
      referenceId,
      amount,
      reason = "REFERRAL_BONUS",
    }) => {
      amount = Number(amount) || 0;
      if (amount <= 0) return;

      let wallet = await db.wallet.findOne({
        where: {
          user_token: userToken,
          role: userRole,
          status: "ACTIVE",
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!wallet) {
        wallet = await db.wallet.create(
          {
            token: randomstring(64),
            user_token: userToken,
            role: userRole,
            wallet_balance: 0,
            referral_balance: 0,
            total_balance: 0,
            currency: "INR",
            status: "ACTIVE",
          },
          { transaction }
        );
      }

      const openingWalletBalance = Number(wallet.wallet_balance) || 0;
      const openingReferralBalance = Number(wallet.referral_balance) || 0;
      const openingTotalBalance = Number(wallet.total_balance) || 0;

      const closingWalletBalance = openingWalletBalance;
      const closingReferralBalance = openingReferralBalance + amount;
      const closingTotalBalance =
        closingWalletBalance + closingReferralBalance;

      await wallet.update(
        {
          referral_balance: closingReferralBalance,
          total_balance: closingTotalBalance,
          last_transaction_at: new Date(),
        },
        { transaction }
      );

      await db.wallet_transaction.create(
        {
          token: randomstring(64),
          wallet_id: wallet.id,
          transaction_type: "CREDIT",
          amount,
          opening_balance: openingTotalBalance,
          closing_balance: closingTotalBalance,
          wallet_balance: closingWalletBalance,
          referral_balance: closingReferralBalance,
          reason,
          reference_type: userRole,
          reference_id: referenceId,
          status: "SUCCESS",
        },
        { transaction }
      );
    };

    if (refCode && refCode !== "null" && refCode !== "undefined") {
      if (!isNew) {
        await transaction.rollback();
        return res.status(400).json(
          responseData(
            "Referral code can only be used during registration",
            {},
            req,
            false
          )
        );
      }

      const referringUser = await Model.findOne({
        where: { ref_code: refCode, flag: 0 },
        transaction,
      });

      if (!referringUser) {
        await transaction.rollback();
        return res.status(400).json(
          responseData("Invalid referral code", {}, req, false)
        );
      }

      if (referringUser.token === userToken) {
        await transaction.rollback();
        return res.status(400).json(
          responseData("You cannot use your own referral code", {}, req, false)
        );
      }

      await Model.update(
        { referer_code_used: referringUser.id },
        { where: { id: user.id }, transaction }
      );

      const referralCodeInfo = await db.referral_setting.findOne({
        where: { id: 1 },
        transaction,
      });

      const refereeBonus = Number(referralCodeInfo?.referee_bonus) || 0;
      const referrerBonus = Number(referralCodeInfo?.referrer_bonus) || 0;

      // ULTA BONUS APPLY KIYA GYA HAI
      // referring user ko refereeBonus
      await creditReferralWallet({
        userToken: referringUser.token,
        userRole: roleUpper,
        referenceId: user.id,
        amount: refereeBonus,
        reason: "REFERRAL_BONUS_REFERRER",
      });

      // new registered user ko referrerBonus
      await creditReferralWallet({
        userToken: userToken,
        userRole: roleUpper,
        referenceId: referringUser.id,
        amount: referrerBonus,
        reason: "REFERRAL_BONUS_REFEREE",
      });

      await db.referral_history.create(
        {
          referrer_id: referringUser.id,
          referee_id: user.id,
          // history me bhi ulta save kiya
          referrer_amount: refereeBonus,
          referee_amount: referrerBonus,
          status: "PAID",
        },
        { transaction }
      );
    }

    await transaction.commit();

    const deviceHash = getDeviceHash(req) || randomstring(32);

    await db.session.update(
      { revoked_at: new Date() },
      {
        where: {
          user_token: userToken,
          device_hash: deviceHash,
          revoked_at: null,
        },
      }
    );

    const refreshToken = randomstring(128);
    const encryptedRefreshToken = encryptRefreshToken(refreshToken);

    await db.session.create({
      user_token: userToken,
      role: roleUpper,
      session_token: JSON.stringify(encryptedRefreshToken),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      device_hash: deviceHash,
      ip: req.ip,
      user_agent: req.get("User-Agent"),
      last_used_at: new Date(),
    });

    if (fcmToken && deviceId && DeviceModel) {
      const whereObj = {
        [deviceTokenField]: userToken,
        device_id: deviceId,
      };

      const existingDevice = await DeviceModel.findOne({
        where: whereObj,
      });

      if (existingDevice) {
        await existingDevice.update({
          fcm_token: fcmToken,
          contact: phone,
          platform,
          flag: 0
        });
      } else {
        await DeviceModel.create({
          token: randomstring(64),
          [deviceTokenField]: userToken,
          contact: phone,
          fcm_token: fcmToken,
          device_id: deviceId,
          platform,
        });
      }
    }

    return res.status(200).json(
      responseData(
        "OTP verified successfully",
        {
          identity: role,
          contact: phone,
          token: userToken,
          refreshToken,
          isNew,
        },
        req,
        true
      )
    );
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("verify otp error:", error);

    return res.status(500).json(
      responseData("Error occurred", {}, req, false)
    );
  }
});

router.post("/getOtp", async (req, res) => {
  try {
    const phone = req.body.phone;
    const role = req.body.identity;

    if (!["vendor", "customer"].includes(role)) {
      return res.status(400).json(responseData("Invalid role", {}, req, false));
    }
    if (!phone || !validatePhone(phone)) {
      return res.status(400).json({
        status: 400,
        message: "Phone number invalid",
      });
    }
    const ipAddress =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      req.ip;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const otpCountToday = await db.otp.count({
      where: {
        contact: phone,
        flag: 0,
        create_date: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
    });

    if (otpCountToday >= 5 && ENV === "production") {
      return res.status(429).json({
        status: 429,
        message: "OTP limit reached for today",
      });
    }
    const lastOtp = await db.otp.findOne({
      where: {
        contact: phone,
        role: role,
      },
      order: [["create_date", "DESC"]],
    });

    if (
      lastOtp &&
      ENV === "production" &&
      new Date() - new Date(lastOtp.create_date) < 60000
    ) {
      return res.status(429).json({
        status: 429,
        message: "Please wait before requesting another OTP",
      });
    }

    let otp;

    if (testNumbers.includes(phone)) {
      otp = 123456;
    } else {
      otp = ENV === "production" ? generateOTP() : 123456;
    }

    if (ENV === "production") {
      const valid_time = "18000";
      const apiUrl = "https://web.smscloud.in/api/pushsms";
      const apiUser = "KISTECHNOSOFTWARE";
      const api_authkey = "92hMAvpwqZ6ak";
      const sender = "KTSPLB";
      const entityid = 1701174013505844240n;
      const templateid = 1707174066146600593n;

      const msg =
        otp + " is the secure code to log into your Blackpearl account. Do not share the OTP and your number with any another person! KTSPLB";
      const sms_text = querystring.escape(msg);

      const url = `${apiUrl}?user=${apiUser}&authkey=${api_authkey}&sender=${sender}&mobile=${phone}&text=${sms_text}&templateid=${templateid}&rpt=1`;

      const otpr = await axios.get(url);
    }

    await db.otp.create({
      contact: phone,
      role: role.toUpperCase(),
      otp,
      valid_time: 600000,
      server_time: Date.now(),
      browser_address: req.useragent?.browser || "unknown",
      user_ip: ipAddress,
      mac_address: "NA",
      otp_expire_time: "10 min",
      status: 1,
      flag: 0,
    });

    return res.status(200).json({
      status: 200,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("❌ OTP ERROR:", error);
    return res.status(500).json({
      status: 500,
      message: "Server error",
    });
  }
});

router.use("/vendor", vendorRoutes);
router.use("/customer", customerRoutes)

module.exports = router;
