async function cleanupInvalidTokens({
  response,
  tokens,
  DeviceModel,
  ownerField,
  ownerValue,
}) {
  if (!response || !Array.isArray(response.responses) || !tokens?.length) return;

  const invalidTokens = [];

  response.responses.forEach((res, index) => {
    if (!res.success) {
      const code = res?.error?.code || '';
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      ) {
        invalidTokens.push(tokens[index]);
      }
    }
  });

  if (!invalidTokens.length) return;

  await DeviceModel.destroy({
    where: {
      [ownerField]: ownerValue,
      fcm_token: invalidTokens,
    },
  });
}

module.exports = { cleanupInvalidTokens };