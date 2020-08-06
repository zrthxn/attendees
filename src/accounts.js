/**
 * @description
 * Handles adding and deleting accounts.
 */

import path from 'path'
import fs from 'fs'

import { AUTHDIR } from '.'

/**
 * Read the GMailer config file
 */
export async function readConfigFile() {
  try {
    let data = fs.readFileSync(path.join(AUTHDIR, 'auth.config.json'), { encoding: 'utf-8' })
    return JSON.parse(data.toString())
  } catch (error) {
    console.error(error)
    return Promise.reject(error)
  }
}

/**
 * Read credentials
 */
export async function readCredentials() {
  let config = await readConfigFile()
  
  if(config.hasOwnProperty('credentials'))
    return config.credentials
  else
    throw `No CREDENTIALS field on registry.`
}

/**
 * Read token file for a given email
 * @param userId 
 */
export async function readToken(userId) {
  let config = await readConfigFile()
  
  try {
    if(config.accounts.hasOwnProperty(userId)) {
      const token = config.accounts[userId].token
      
      if (token.expiresOn < Date.now())
        throw "Token expired"
  
      return token
    }
    else
      return null 
  } catch (error) {
    console.error(userId, error)
    return null
  }
}

/**
 * Adds email and credentials file to account registry 
 * in the config file.
 * @param userId 
 * @param credentials path of credentials file 
 */
export async function addAccount(userId, credentials, username = undefined) {  
  try {
    let config = await readConfigFile()
    
    fs.mkdirSync(path.join(AUTHDIR, 'auth', userId), { recursive: true })
    fs.copyFileSync(path.resolve(credentials), path.join(AUTHDIR, 'auth', userId, 'credentials.json'))

    config.accounts[userId] = {
      userId: userId,
      credentials: path.join(AUTHDIR, 'auth', userId, 'credentials.json'),
      createdOn: +new Date,
      username
    }

    fs.writeFileSync(path.join(AUTHDIR, 'auth.config.json'), JSON.stringify(config, null, 2))
    return
  } catch (error) {
    console.error(error)
    throw `Invalid config dir path: '${AUTHDIR}'`
  }
}

/**
 * Check if account token exists
 * @param userId 
 */
export async function checkAccount(userId) {
  try {
    const config = await readConfigFile()

    if(!config.accounts[userId].hasOwnProperty('token'))
      throw `${userId}: account not on registry`

    const token = fs.readFileSync(path.resolve(config.accounts[userId].token))
    
    if(!token)
      throw `${userId}: token file doesn't exist but on registry`

    return true
  } catch (error) {
    return false
  }
}

/**
 * Deletes email, credentials file and token file 
 * from account registry.
 * @param email Email to delete from registry
 */
export async function deleteAccount(userId) {
  if(process.env['VERBOSITY']=='true')
    console.log('Deleting account', userId)
  
  try {
    let config = await readConfigFile()

    if(config.accounts[userId].hasOwnProperty('token'))
      fs.unlinkSync(path.resolve(config.accounts[userId].token))

    fs.rmdirSync(path.join(AUTHDIR, 'auth', userId), { recursive: true })

    delete config.accounts[userId]
    fs.writeFileSync(path.join(AUTHDIR, 'auth.config.json'), JSON.stringify(config, null, 2))

    if(process.env['VERBOSITY']=='true') console.log('Done')
    return
  } catch (error) {
    console.error(error)
    throw `Invalid config dir path: '${AUTHDIR}'`
  }
}
