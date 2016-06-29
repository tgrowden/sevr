'use strict'

const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')

class Authentication {
	constructor(tokenSecret) {
		this._enabled = false
		this._collection = undefined
		this._tokenSecret = tokenSecret
	}

	get isEnabled() {
		return this._enabled
	}

	get collection() {
		return this._collection
	}

	/**
	 * Enable authentication and add the
	 * authentication collection
	 * @param  {Collection} coll
	 */
	enable(coll) {
		if (!coll.getField('username') || !coll.getField('password')) {
			throw new Error('Authentication collection must have "username" and "password"')
		}

		this._collection = coll
		this._collection.extendFieldSchema('password', 'set', Authentication._setPassword)
		this._enabled = true
	}

	/**
	 * Attempt to validate user credentials.
	 * When successful, resolves with user document
	 * @param  {Object} creds
	 * @return {Promise}
	 */
	validateCredentials(creds) {
		return this._collection.read({
			username: creds.username
		}, ['+password'], true, true)
		.then(user => {
			return new Promise((res, rej) => {
				if (!user) return rej()

				bcrypt.compare(creds.password, user.password, (err, valid) => {
					if (err || !valid) {
						return rej()
					}

					res(user)
				})
			})
		})
	}

	/**
	 * Create a JWT token with the given
	 * user information.
	 * Returned promise resolves with the token
	 * @param  {Object} user
	 * @return {Promise}
	 */
	createToken(user) {
		return new Promise((res, rej) => {
			try {
				jwt.sign(user.toObject(), this._tokenSecret, null, token => {
					res(token)
				})
			} catch(err) {
				rej(err)
			}
		})
	}

	/**
	 * Verify a JWT token.
	 * Returned promise resolves with the user document
	 * @param  {String} token
	 * @return {Promise}
	 */
	verifyToken(token) {
		return new Promise((res, rej) => {
			jwt.verify(token, this._tokenSecret, (err, user) => {
				if (err) {
					return rej(err)
				}

				res(user)
			})
		})
	}

	/**
	 * Password field setter
	 * @param {String} val
	 * @private
	 */
	static _setPassword(val) {
		return bcrypt.hashSync(val, 10)
	}
}

module.exports = Authentication