'use strict'

const jsonApi = require('../../.')
const peopleHandler = require('../handlers/peopleHandler.js')
const { notesData } = require('../notesData.js')

jsonApi.define({
  namespace: 'json:api',
  resource: 'people',
  description: 'Used to attribute work to specific people.',
  handlers: peopleHandler,
  primaryKey: 'uuid',
  searchParams: { },
  attributes: {
    firstname: jsonApi.Joi.string().alphanum()
      .description('The persons first name')
      .example('John'),
    lastname: jsonApi.Joi.string().alphanum()
      .description('The persons last name')
      .example('Smith'),
    email: jsonApi.Joi.string().email()
      .description('The persons preferred contact email address')
      .example('john.smith@gmail.com'),
    articles: jsonApi.Joi.belongsToMany({
      resource: 'articles',
      as: 'author'
    }),
    notes: jsonApi.Joi.many("notes"),
    photos: jsonApi.Joi.belongsToMany({
      resource: 'photos',
      as: 'photographer'
    })
  },
  actions: {
    login: {
      params: {
        username: jsonApi.Joi.string(),
        password: jsonApi.Joi.string()},
      get () {
        return {}
      },
      post () {
        return {}
      }
    }
  },
  examples: [
    {
      id: 'cc5cca2e-0dd8-4b95-8cfc-a11230e73116',
      type: 'people',
      firstname: 'Oli',
      lastname: 'Rumbelow',
      email: 'oliver.rumbelow@example.com',
      notes: [],
    },
    {
      id: '32fb0105-acaa-4adb-9ec4-8b49633695e1',
      type: 'people',
      firstname: 'Pedro',
      lastname: 'Romano',
      email: 'pedro.romano@example.com',
      notes: [],
    },
    {
      id: 'd850ea75-4427-4f81-8595-039990aeede5',
      type: 'people',
      firstname: 'Mark',
      lastname: 'Fermor',
      email: 'mark.fermor@example.com',
      notes: [],
    },
    {
      id: 'ad3aa89e-9c5b-4ac9-a652-6670f9f27587',
      type: 'people',
      firstname: 'Rahul',
      lastname: 'Patel',
      email: 'rahul.patel@example.com',
      notes: [],
    },
    {
      id: 'be100353-4f53-494b-8af9-ba9b8c425527',
      type: 'people',
      firstname: 'Bulk',
      lastname: 'Uploader',
      email: 'bulk.uploader@example.com',
      notes: notesData.slice(0, 1_005).map(n => ({type: n.type, id: n.id})),
    }
  ]
})
