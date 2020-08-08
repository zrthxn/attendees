/**
 * @description
 * Handle authentication with GMail scopes with OAuth2 and store token files.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { Router } from 'express'
import { google } from 'googleapis'

import { readCredentials, readToken, readConfigFile } from './accounts'
import { firestore } from './database'
import { AUTHDIR } from '.'

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
const COOKIE_MAX_AGE = 86400000 // 24 Hours

export const authRouter = Router()

authRouter.get('/login', (_, res)=>{
  res.render('login', { title: 'Login to Google' })
})

authRouter.post('/login', async (req, res)=>{
  const { email } = req.body
  const { access } = req.signedCookies

  const credentials = await readCredentials()
  const { client_secret, client_id, redirect_uris } = credentials.web
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  const token = await readToken(email)

  if (token) {
    if (access === crypto.createHash('sha512')
      .update(process.env.AUTH_KEY)
      .update(token.tokens.access_token)
      .digest('hex')) 
    {
      let destination
      switch (req.query.then) {
        case 'create':
          destination = '/sheets/create'
          break
      
        default: 
          destination = '/sheets'
          break
      }
      
      return res.redirect(destination)
    }
  }

  res.cookie('userId', email, { httpOnly: true })
  return res.redirect(
    oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES
    })
  )
})

authRouter.get('/callback', async (req, res)=>{
  const { code } = req.query
  const { userId } = req.cookies

  if(!userId) // Safegaurd
    return res.sendStatus(403)
  if(!code) // Safegaurd
    return res.sendStatus(403)

  const credentials = await readCredentials()
  const { client_secret, client_id, redirect_uris } = credentials.web
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  try {
    let token = await oAuth2Client.getToken(code)
    oAuth2Client.setCredentials(token)

    let config = await readConfigFile()
    config.accounts[userId] = token.tokens
    
    fs.writeFileSync(path.join(AUTHDIR, 'auth.config.json'), JSON.stringify(config, null, 2))
    
    /** @access Set document cookie */
    res.cookie('access', crypto.createHash('sha512')
      .update(process.env.AUTH_KEY)
      .update(token.tokens.access_token)
      .digest('hex'), {
      maxAge: COOKIE_MAX_AGE, httpOnly: true, signed: true
    })
    
    await firestore.collection('users').doc(userId).set({
      userId, 
      createdOn: (new Date()).toUTCString(),
      sheets: []
    })

    return res.redirect('/sheets')
  } catch (error) {
    console.error(error)
    return res.sendStatus(500)
  }
})