// Legacy compatibility facade. New code uses the modular tool system under ../tools/.
const office=require("../tools/office");
module.exports={schemas:office.schemas,call:office.call};
