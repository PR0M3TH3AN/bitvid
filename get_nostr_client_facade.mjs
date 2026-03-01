import fs from 'fs';

const fileContent = fs.readFileSync('js/nostrClientFacade.js', 'utf8');
if (fileContent.includes('signAndPublishEvent') && fileContent.includes('loginWithExtension') && fileContent.includes('nostrClient')) {
  console.log("facade valid");
} else {
  console.log("facade invalid", fileContent.includes('signAndPublishEvent'), fileContent.includes('loginWithExtension'), fileContent.includes('nostrClient'));
}
