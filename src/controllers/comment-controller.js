const {
  classifyPayload,
  buildDecisionPayload,
  badRequest,
  serviceUnavailable,
  asNonEmptyString,
  asPositiveInteger
} = require('./security-response-utils');
const { createComment } = require('../repositories/comments-repository');
const { findProductById } = require('../repositories/products-repository');
const { findUserByUsername } = require('../repositories/users-repository');

async function commentHandler(req, res) {
  const requestId = req.requestId;
  const content = asNonEmptyString(req.body?.content);
  const username = 'demo-user';
  const productId = asPositiveInteger(req.body?.productId);

  if (!content || content.length > 4096) {
    return badRequest(res, requestId, 'INVALID_COMMENT_INPUT', 'content must be a non-empty string up to 4096 chars');
  }

  if (!productId) {
    return badRequest(res, requestId, 'INVALID_PRODUCT_ID', 'productId must be a positive integer');
  }

  const payload = `content=${content}&productId=${productId}`;
  const matches = classifyPayload(payload);

  if (matches.length > 0) {
    const blockedResponse = buildDecisionPayload({
      requestId,
      endpoint: '/api/comment',
      payload,
      matches,
      method: 'POST',
      res
    });
    return res.status(200).json(blockedResponse);
  }

  try {
    const [user, product] = await Promise.all([
      findUserByUsername(username),
      findProductById(productId)
    ]);

    if (!user) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'user does not exist'
        },
        requestId
      });
    }

    if (!product) {
      return res.status(404).json({
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'product does not exist'
        },
        requestId
      });
    }

    const comment = await createComment({
      userId: user.id,
      productId: product.id,
      content
    });

    const response = buildDecisionPayload({
      requestId,
      endpoint: '/api/comment',
      payload,
      matches: [],
      method: 'POST',
      res
    });

    response.comment = comment;

    return res.status(200).json(response);
  } catch (_error) {
    return serviceUnavailable(res, requestId);
  }
}

module.exports = { commentHandler };