import { Mongo } from 'meteor/mongo'
import { Factory } from 'meteor/dburles:factory'
import { SimpleSchema } from 'meteor/aldeed:simple-schema'
import { Fake } from 'meteor/anti:fake'
import { SurveyQuestions } from '../survey_questions/survey_questions'
import { SurveyAnswers } from '../survey_answers/survey_answers'
import { Messages } from '../messages/messages'

export const CampaignContacts = new Mongo.Collection('campaign_contacts')

// Deny all client-side updates since we will be using methods to manage this collection
CampaignContacts.deny({
  insert() { return true },
  update() { return true },
  remove() { return true }
})

CampaignContacts.schema = new SimpleSchema({
  // userId: { type: String, regEx: SimpleSchema.RegEx.Id, optional: true },
  campaignId: { type: String },
  // This would be used to send data back to whatever your source of contacts is --
  // You could then remove users if opting them out or mark phone numbers as
  // untextable, etc. This is taken from the source data itself,
  // not an ID in our own system
  contactId: { type: String },
  name: { type: String },
  number: { type: String },
  customFields: { type: Object, blackbox: true },
  createdAt: { type: Date },
  assignmentId: { type: String }, // so we can tell easily what is unassigned
  campaignSurveyId: {
    type: String,
    optional: true
  }
})

CampaignContacts.attachSchema(CampaignContacts.schema)

Factory.define('campaign_contact', CampaignContacts, {
  campaignId: () => Factory.get('campaign'),
  contactId: () => Fake.word(),
  name: () => Fake.user({ fields: ['name'] }).name,
  number: '669-221-6251',
  customFields: () => {
    const fields = {}
    fields[Fake.word()] = Fake.sentence(2)
    return fields
  },
  createdAt: () => new Date(),
  assignmentId: () => Factory.get('assignment'),
  campaignSurveyId: null
})

// This represents the keys from CampaignContacts objects that should be published
// to the client. If we add secret properties to List objects, don't list
// them here to keep them private to the server.
CampaignContacts.publicFields = {
}


const DEFAULT_SCRIPT_FIELDS = ['name', 'number']

CampaignContacts.helpers({
  messages() {
    return Messages.find({ contactNumber: this.number })
  },
  surveyAnswer(surveyQuestionId) {
    console.log("survey question id ", surveyQuestionId, "and campaignContactId", this._id, SurveyAnswers.findOne({
      surveyQuestionId,
      campaignContactId: this._id
    }))

    return SurveyAnswers.findOne({
      surveyQuestionId,
      campaignContactId: this._id
    })
  },
  survey() {
    if (!this.campaignSurveyId) {
      return SurveyQuestions.findOne({ campaignId: this.campaignId, parentAnswer: null})
    }
    return SurveyQuestions.findOne({ _id: this.campaignSurveyId })
  },

  scriptFields() {
    return Object.keys(this.customFields).concat(DEFAULT_SCRIPT_FIELDS)
  },

  getScriptField(fieldName) {
    if (this.scriptFields().indexOf(fieldName) === -1) {
      throw new Error(`Invalid script field ${fieldName} requested for campaignContact ${this._id}`)
    }

    if (DEFAULT_SCRIPT_FIELDS.indexOf(fieldName) !== -1) {
      return this[fieldName]
    }

    return this.customFields[fieldName]
  }
})
