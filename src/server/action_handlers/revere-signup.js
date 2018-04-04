import request from 'request'
import { r } from '../models'

// What the user sees as the option
export const displayName = () => 'Revere Signup'

const listId = process.env.REVERE_LIST_ID
const mobileFlowId = process.env.REVERE_NEW_SUBSCRIBER_MOBILE_FLOW
const mobileApiKey = process.env.REVERE_MOBILE_API_KEY
const akAddUserUrl = process.env.AK_ADD_USER_URL
const akAddPhoneUrl = process.env.AK_ADD_PHONE_URL

// The Help text for the user after selecting the action
export const instructions = () => (
  'This option triggers a new user request to Revere when selected.'
)

export async function available(organizationId) {
  if (listId && process.env.REVERE_MOBILE_API_KEY) {
    return true
  }
}

export async function processAction(questionResponse, interactionStep, campaignContactId) {

    const contactRes = await r.knex('campaign_contact')
      .where('campaign_contact.id', campaignContactId)
      .leftJoin('campaign', 'campaign_contact.campaign_id', 'campaign.id')
      .leftJoin('organization', 'campaign.organization_id', 'organization.id')
      .select('campaign_contact.cell', 'campaign_contact.first_name', 'campaign_contact.last_name')
    const contact = (contactRes.length ? contactRes[0] : {})
    const contactCell = contact.cell.substring(1)

    let options = {
      method: 'POST',
      url: 'https://mobile.reverehq.com/api/v1/messaging/sendContent',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'Authorization': mobileApiKey
      },
      body: {
        msisdns: [`00${contactCell}`],
        mobileFlow: `${mobileFlowId}`,
        list: listId
      },
      json: true
    }

    request(options, (error, response, body) => {
      if (error) throw new Error(error)
      if(response.statusCode == 204 && process.env.AK_ADD_USER_URL){
        const userData = {
          'email': contactCell +  'smssubscriber@test.com',
          'first_name': contact.first_name,
          'last_name': contact.last_name,
          'sms_subscribed': true,
          'action_mobilesubscribe': true,
          'suppress_subscribe': true,
          'phone': [contactCell],
          'phone_type': 'mobile',
          'source': 'spoke-signup',
        }

        request.post({
          'url': akAddUserUrl,
          headers: {
            accept: 'application/json',
            'content-type': 'application/json'
          },
          'form': userData
        }, (error, response, body) => {

          if (error) throw new Error(error)
          if(response.statusCode === 201){
            request.post({
              'url': akAddPhoneUrl,
              headers: {
                accept: 'application/json',
                'content-type': 'application/json'
              },
              'form': {
                'user': response.headers['location'],
                'phone': contactCell,
                'type': 'mobile'
              }
            }, (error, response, body) => {
              if (error) throw new Error(error)
              console.log('response', response);
              console.log('body', body);
            })
          }
        })
      } else {
        return
      }

    })
}
