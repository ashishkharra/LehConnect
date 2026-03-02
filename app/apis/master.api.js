const router = require("express").Router();
const vendorRoutes = require("./vendor.api.js");
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
const { vendorMiddleware } = require("../middleware/auth.js");
const admin = require("../config/firebase.js");
const { ENV, testNumbers } = require("../config/globals.js");
const querystring = require("querystring");
const axios = require("axios");

async function recordReferral(newVendorId) {
  try {
    const newVendor = await db.vendor.findByPk(newVendorId);
    if (!newVendor || !newVendor.referer_code_used) {
      return console.log("No referral code used.");
    }
    const settings = await db.referral_setting.findByPk(1);

    console.log(settings)
    const referrerId = newVendor.referer_code_used;

    await db.referral_history.create({
      referrer_id: referrerId,
      referee_id: newVendorId,
      referrer_amount: settings.referrer_bonus === null || settings.referrer_bonus === '' ? settings.referrer_bonus : 500,
      referee_amount: settings.referee_bonus === null || settings.referee_bonus === '' ? settings.referee_bonus : 250,
      status: "PENDING",
    });

    console.log("Referral info saved successfully.");
  } catch (error) {
    console.error("Error saving referral info:", error);
  }
}

router.get("/", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

router.post("/refresh-token", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const clientRefreshToken = req.headers["x-refresh-token"];

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
      JSON.parse(session.session_token),
    );

    if (decryptedRefresh !== clientRefreshToken) {
      return res
        .status(401)
        .json(responseData("Invalid refresh token", {}, req, false));
    }

    const newRefreshToken = randomstring(128);
    const encryptedNewRefresh = encryptRefreshToken(newRefreshToken);

    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await session.update({
      session_token: JSON.stringify(encryptedNewRefresh),
      expires_at: newExpiry,
      last_used_at: new Date(),
    });

    const user = await db.vendor.findOne({
      where: { token, flag: 0 },
    });

    if (!user) {
      return res.status(401).json(responseData("Unauthorized", {}, req, false));
    }

    return res.status(200).json(
      responseData(
        "Silent login successful",
        {
          token,
          refreshToken: newRefreshToken,
          identity: "VENDOR",
        },
        req,
        true,
      ),
    );
  } catch (err) {
    console.error("Refresh token error:", err);
    return res.status(401).json(responseData("Unauthorized", {}, req, false));
  }
});

router.post("/logout", [vendorMiddleware], async (req, res) => {
  try {
    const session = req.dbSession;

    await session.update({ revoked_at: new Date() });
    await req.user.update({
      access_token_revoked: true,
      refresh_token_revoked: true,
    });

    const fcmToken = req.body.fcmToken;
    // let preferredCities = req.user.preferred_cities;
    // if (typeof preferredCities === "string") {
    //     try {
    //         preferredCities = JSON.parse(
    //             preferredCities.replace(/'/g, '"')
    //         );
    //     } catch {
    //         preferredCities = [];
    //     }
    // }
    // if (!Array.isArray(preferredCities)) {
    //     preferredCities = [];
    // }
    // preferredCities = preferredCities
    //     .map(c => String(c).trim())
    //     .filter(c => c.length > 0);

    // const topics = preferredCities.map(c =>
    //     `city_${c.toLowerCase().replace(/\s+/g, "_")}`
    // );
    // if (fcmToken && topics.length) {
    //     await admin.messaging().unsubscribeFromTopic(fcmToken, topics);
    // }
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
    const role = req.body.identity?.trim();
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

    const expireTime = Number(otpData.server_time) + 3 * 60 * 1000;
    if (Date.now() > expireTime) {
      await db.otp.update(
        { flag: 1 },
        { where: { contact: phone, role }, transaction },
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
      { where: { id: otpData.id }, transaction },
    );

    const Model = role === "customer" ? db.customer : db.vendor;

    let user = await Model.findOne({
      where: { contact: phone, flag: 0 },
      transaction,
    });

    const userToken = user ? user.token : randomstring(64);
    let isNew = false;

    if (!user) {
      user = await Model.create(
        {
          contact: phone,
          role: role.toUpperCase(),
          token: userToken,
          ip: req.ip,
          user_agent: req.get("User-Agent"),
        },
        { transaction },
      );

      isNew = true;
    }

    let userWallet = await db.wallet.findOne({
      where: {
        user_token: userToken,
        role: role.toUpperCase(),
        status: "ACTIVE",
      },
      transaction,
    });

    if (!userWallet) {
      userWallet = await db.wallet.create(
        {
          token: randomstring(64),
          user_token: userToken,
          role: role.toUpperCase(),
          balance: 0,
          currency: "INR",
          status: "ACTIVE",
        },
        { transaction },
      );
    }

    let referralVendorId = null;

    if (refCode && refCode !== "null" && refCode !== "undefined") {

      if (role !== "vendor") {
        await transaction.rollback();
        return res.status(403).json(
          responseData("Only vendors can use referral codes", {}, req, false)
        );
      }

      if (!isNew) {
        await transaction.rollback();
        return res.status(400).json(
          responseData("Referral code can only be used during registration", {}, req, false)
        );
      }

      const referringVendor = await db.vendor.findOne({
        where: { ref_code: refCode, flag: 0 },
        transaction,
      });

      if (!referringVendor) {
        await transaction.rollback();
        return res.status(400).json(
          responseData("Invalid referral code", {}, req, false)
        );
      }

      if (referringVendor.token === userToken) {
        await transaction.rollback();
        return res.status(400).json(
          responseData("You cannot use your own referral code", {}, req, false)
        );
      }

      await db.vendor.update(
        { referer_code_used: referringVendor.id },
        { where: { id: user.id }, transaction },
      );

      referralVendorId = user.id;

      const referralCodeInfo = await db.referral_setting.findOne({
        where: { id: 1 },
        transaction,
      });

      const refereeBonus = Number(referralCodeInfo?.referee_bonus) || 0;
      const referrerBonus = Number(referralCodeInfo?.referrer_bonus) || 0;

      const creditWallet = async (walletToken, referenceId, amount) => {
        amount = Number(amount) || 0;

        let wallet = await db.wallet.findOne({
          where: {
            user_token: walletToken,
            role: "VENDOR",
            status: "ACTIVE",
          },
          transaction,
        });

        if (!wallet) {
          wallet = await db.wallet.create(
            {
              token: randomstring(64),
              user_token: walletToken,
              role: "VENDOR",
              balance: 0,
              currency: "INR",
              status: "ACTIVE",
            },
            { transaction },
          );
        }

        const opening = Number(wallet.balance);
        const closing = opening + amount;

        await db.wallet.update(
          { balance: closing, last_transaction_at: new Date() },
          { where: { id: wallet.id }, transaction },
        );

        await db.wallet_transaction.create(
          {
            token: randomstring(64),
            wallet_id: wallet.id,
            transaction_type: "CREDIT",
            amount,
            opening_balance: opening,
            closing_balance: closing,
            reason: "REFERRAL_BONUS",
            reference_type: "VENDOR",
            reference_id: referenceId,
            status: "SUCCESS",
          },
          { transaction },
        );
      };

      await creditWallet(referringVendor.token, user.id, referrerBonus);
      await creditWallet(userToken, referringVendor.id, refereeBonus);
    }

    await transaction.commit();

    if (referralVendorId) {
      recordReferral(referralVendorId).catch((err) =>
        console.error("Referral history error:", err),
      );
    }

    const deviceHash = getDeviceHash(req) || randomstring(32);

    await db.session.update(
      { revoked_at: new Date() },
      {
        where: {
          user_token: userToken,
          device_hash: deviceHash,
          revoked_at: null,
        },
      },
    );

    const refreshToken = randomstring(128);
    const encryptedRefreshToken = encryptRefreshToken(refreshToken);

    await db.session.create({
      user_token: userToken,
      role: role.toUpperCase(),
      session_token: JSON.stringify(encryptedRefreshToken),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      device_hash: deviceHash,
      ip: req.ip,
      user_agent: req.get("User-Agent"),
      last_used_at: new Date(),
    });

    if (role === "vendor" && fcmToken && deviceId) {
      const existingDevice = await db.vendor_device_fcm.findOne({
        where: { vendor_token: userToken, device_id: deviceId },
      });

      if (existingDevice) {
        await existingDevice.update({
          fcm_token: fcmToken,
          contact: phone,
          platform,
        });
      } else {
        await db.vendor_device_fcm.create({
          token: randomstring(64),
          vendor_token: userToken,
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
        true,
      ),
    );
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("verify otp error:", error);

    return res.status(500).json(responseData("Error occurred", {}, req, false));
  }
});

router.post("/getOtp", async (req, res) => {
  try {
    console.log(req.body);
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

    // if (ENV === 'production' && recaptchaToken) {
    //     const captchaVerification = await verifyRecaptcha(recaptchaToken);

    //     if (
    //         !captchaVerification.success ||
    //         (captchaVerification.score && captchaVerification.score < 0.5)
    //     ) {
    //         return res.status(400).json({
    //             status: 400,
    //             message: 'reCAPTCHA verification failed'
    //         });
    //     }
    // }

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
      valid_time: 18000,
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

module.exports = router;
