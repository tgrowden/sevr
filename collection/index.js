'use strict'

const format        = require('util').format
const _             = require('lodash')
const mongoose      = require('mongoose')
const SchemaBuilder = require('../lib/schema-builder')

const requiredProperties = {
	base: [
		{ prop: 'singular', type: 'String' },
		{ prop: 'fields', type: 'PlainObject' }
	],
	field: [
		{ prop: 'label', type: 'String' },
		{ prop: 'schemaType', type: ['Array', 'Object'] }
	]
}

const defaultPermissions = {
	read: '*',
	write: '*'
}

mongoose.Promise = global.Promise

class Collection {
	constructor(name, def, factory) {
		this._name = name
		this._definition = _.defaultsDeep({}, def)
		this._factory = factory
		this._connection = this._factory.connection

		// Normalize definition fields by adding a name property
		// tht matches the field key
		Object.keys(this._definition.fields).forEach(key => {
			this._definition.fields[key].name = key
		})

		// Add default permissions
		this._permissions = _.assign({}, defaultPermissions, this._definition.permissions)

		// Check for required properties
		if (!this._definition.hasOwnProperty('singular')) {
			throw new Error(format('Collection `%s` must contain `singular` property', this._name))
		}

		// Create the mongoose model
		try {
			// Do not attempt to recreate the model if it already exists
			if (!this._connection.models.hasOwnProperty(this._definition.singular)) {
				this._model = this._connection.model(this._definition.singular, SchemaBuilder.create(this._definition))
			} else {
				this._model = this._connection.models[this._definition.singular]
			}
		} catch (err) {
			throw new Error(format('Failed to create collection `%s`:', this._name, err))
		}
	}

	/**
	 * Check if a collection definition is valid
	 * @param {Object} definition
	 * @param {Array} [errors] Mutated by the method to return all errors
	 * @return {Boolean}
	 */
	static isValidDefinition(definition, errors) {
		let isValid = true

		requiredProperties.base.forEach(required => {
			if (!definition.hasOwnProperty(required.prop)) {
				errors.push(format('must contain the `%s` property', required.prop))
				isValid = false
			}

			let requiredTypes = Array.isArray(required.type) ? required.type : [required.type]
			let validType = false

			requiredTypes.forEach(type => {
				if (_['is' + type](definition[required.prop])) {
					validType = true
				}
			})

			if (!validType) {
				errors.push(format('`%s` must be of type %s', required.prop, requiredTypes))
				isValid = false
			}
		})

		return isValid
	}


	/**
	 * Check if a field definition is valid
	 * @param  {Object} fieldDef
	 * @param  {Array} errors
	 * @return {Boolean}
	 */
	static isValidField(fieldDef, errors) {
		let isValid = true

		requiredProperties.field.forEach(required => {
			if (!fieldDef.hasOwnProperty(required.prop)) {
				errors.push(format('field must contain `%s` property', required.prop))
				isValid = false
			}

			let requiredTypes = Array.isArray(required.type) ? required.type : [required.type]
			let validType = false

			requiredTypes.forEach(type => {
				if (_['is' + type](fieldDef[required.prop])) {
					validType = true
				}
			})

			if (!validType) {
				errors.push(format('`%s` must be of type %s', required.prop, requiredTypes))
				isValid = false
			}
		})

		return isValid
	}

	/**
	 * Get the collection name
	 * @return {String}
	 */
	get name() {
		return this._name
	}

	/**
	 * Get the collection definition
	 * @return {Object}
	 */
	get definition() {
		return _.defaultsDeep({}, this._definition)
	}

	/**
	 * Get the collection's model name
	 * @return {String}
	 */
	get modelName() {
		return this._definition.singular
	}

	/**
	 * Get the array of fields that need to be populated
	 * by Mongoose
	 * @return {Array}
	 */
	get populationFields() {
		return Object.keys(
			_.pickBy(this._definition.fields, (field) => {
				if (Array.isArray(field.schemaType)) {
					return field.schemaType[0].hasOwnProperty('ref')
				} else {
					return field.schemaType.hasOwnProperty('ref')
				}
			})
		)
	}

	/**
	 * Get the Mongoose model
	 * @return {Object}
	 */
	get model() {
		return this._model
	}

	/**
	 * Get the model's schema
	 */
	get schema() {
		return this._model.schema
	}

	/**
	 * Get the collection metadata
	 * @return {Object}
	 */
	get meta() {
		return this.getMeta()
	}

	/**
	 * Get the field ref
	 * @param  {Object} fieldDef
	 * @return {String}
	 */
	static getFieldRef(fieldDef) {
		const schemaType = fieldDef.schemaType

		if (Array.isArray(schemaType)) {
			return schemaType[0].ref
		} else {
			return schemaType.ref
		}
	}

	/**
	 * Return all collection field definitions
	 * @return {Object}
	 */
	getFields() {
		const fields = {}

		_.values(this._definition.fields).forEach(field => {
			fields[field.name] = this.getField(field.name)
		})

		return fields
	}

	/**
	 * Return a field from the definition.
	 * If the field has a ref, add `referenceModel` property
	 * @param  {String} fieldName
	 * @return {Object}
	 */
	getField(fieldName) {
		if (!this._definition.fields.hasOwnProperty(fieldName)) {
			return
		}

		const field = _.assign({}, this._definition.fields[fieldName])
		const ref = Collection.getFieldRef(field)

		if (ref) {
			field.referenceModel = this._factory.getInstanceWithModel(ref).model
		}

		return field
	}

	/**
	 * Get the field type name
	 * @param  {String} fieldName
	 * @return {String}
	 */
	getFieldTypeName(fieldName) {
		const fieldDef = this._definition.fields[fieldName]

		if (Array.isArray(fieldDef.schemaType)) {
			return fieldDef.schemaType[0].name
		} else {
			return fieldDef.schemaType.name
		}
	}

	/**
	 * Get the meta property, or all meta if no property provided
	 * @param  {String} [prop]
	 * @return {*}
	 */
	getMeta(prop) {
		if (!this._definition.meta) return

		if (!prop) {
			return _.assign({}, this._definition.meta)
		}

		if(typeof this._definition.meta[prop] == 'object') {
			return _.assign({}, this._definition.meta[prop])
		} else {
			return this._definition.meta[prop]
		}
	}

	/**
	 * Check user permissions for type
	 * @param  {String} user
	 * @param  {String} type
	 * @return {Boolean}
	 * @private
	 */
	_checkPermission(user, type) {
		if (this._permissions[type] == '*') {
			return true
		}

		let readPermission = this._permissions[type]

		if (!Array.isArray(readPermission)) {
			readPermission = [readPermission]
		}

		return readPermission.indexOf(user) != -1
	}

	/**
	 * Does the user have read permissions to the collection
	 * @param  {String} user
	 * @return {Boolean}
	 */
	canUserRead(user) {
		return this._checkPermission(user, 'read')
	}

	/**
	 * Does the user have read permissions to the collection
	 * @param  {String} user
	 * @return {Boolean}
	 */
	canUserWrite(user) {
		return this._checkPermission(user, 'write')
	}


	// CRUD operations
	// ------------------------------------------------------------

	/**
	 * Read the collection
	 * @param   {Object}  [query]
	 * @param   {Boolean} [populate=false]
	 * @returns {Promise}
	 */
	read(query, populate) {
		const popFields = populate ? this.populationFields : []

		return this.model
			.find(query)
			.populate(popFields)
			.exec()
	}

	/**
	 * Read a single document by id
	 * @param   {ObjectId|String|Number} id
	 * @param   {Array} [selectFields]
	 * @param   {Boolean} [populate=false]
	 * @returns {Promise}
	 */
	readById(id, selectFields, populate) {
		const popFields = populate ? this.populationFields : []
		let query

		if (selectFields && !Array.isArray(selectFields)) {
			selectFields = [selectFields]
		}

		query = this.model
			.findById(id)
			.populate(popFields)

		if (selectFields) {
			query = query.select(selectFields.join(' '))
		}

		return query.exec()
	}

	/**
	 * Create a new document within the collection
	 * The resolved document will populate all referenced fields
	 * @param   {Object}     data
	 * @returns {Promise}
	 */
	create(data) {
		const popFields = this.populationFields

		return this.model.create(data)
			.then(doc => {
				if (popFields.length) {
					return doc.populate(popFields.join(' ')).execPopulate()
				} else {
					return doc
				}
			})
	}

	/**
	 * Overwrite the collection with new documents
	 * @param   {Array}      docs
	 * @returns {Promise}
	 */
	update(docs) {
		const self = this

		return new Promise((res, rej) => {
			// Check for the existence of the collection
			this._connection.db.listCollections({
				name: self.name
			})
			.next((err, info) => {
				if (err) return rej(err)
				res(info ? true : false)
			})
		})
		// Drop the collection if it exists
		.then((hasCollection) => {
			if (hasCollection) {
				return new Promise((res, rej) => {
					this._connection.db.dropCollection(self.name, (err) => {
						if (err) return rej(err)
						res()
					})
				})
			} else {
				return
			}
		})
		// Insert the new documents
		.then(() => {
			return new Promise((res, rej) => {
				self.model.insertMany(docs, (err, docs) => {
					if (err) return rej(err)
					res(docs)
				})
			})
		})
	}

	/**
	 * Update a single document by id
	 * @param   {ObjectId|String|Number} id
	 * @param   {Object}                 data
	 * @returns {Promise}
	 */
	updateById(id, data) {
		return this.model.findByIdAndUpdate(id, data, {
			new: true,
			runValidators: true
		}).exec()
	}

	/**
	 * Delete all documents from the collection
	 * @returns {Promise}
	 */
	del() {
		return this.model.find().exec()
			.then(docs => {
				let promises = []

				docs.forEach(doc => {
					promises.push(doc.remove())
				})

				return Promise.all(promises)
			})
	}

	/**
	 * Delete a single document from the collection
	 * @param   {ObjectId|String|Number} id
	 * @returns {Promise}
	 */
	delById(id) {
		return this.model.findByIdAndRemove(id).exec()
	}
}

module.exports = Collection