var util = require('./util.js');
var database = require('./database.js');
var idCounter = 0;
var cache = {};


module.exports = function (structure, id, include) {
  id = id || '';
  include = include || '';
  var queryObject;
  var hash = util.hashString(structure.resource.name+include+id);
  if (cache[hash] !== undefined) {
    queryObject = cache[hash];
  } else {
    queryObject = CreateQueryObject(structure, id);
    cache[hash] = queryObject;
  }


  database.query(queryObject.query, function (error, data) {
    if (error) {
      // callback(error);
      return;
    }

    // build rows using query items
    buildData(data, queryObject);
  });
};






function buildData(data, queryObject) {
  var obj = {
    data: [],
    included: []
  };

  var row = data.pop();
  while (row !== undefined) {
    nestRow(row, queryObject);
    return;
    row = data.pop();
  }
}


function nestRow(row, queryObject) {
  var nest = {};
  walkForRow(row, queryObject.attributes, queryObject.structure.resource, nest);
  console.log(nest)
}

function walkForRow(row, attributes, resource, nest) {
  var isFound = false;
  var attrAliases = Object.keys(attributes[resource.type.id]);
  attrAliases.forEach(function (key) {
    if (attributes[resource.type.id][key].attr.dataType === 'uuid' && row[key]) {
      isFound = true;
    }
  });
  if (isFound === false) { return; }

  attrAliases.forEach(function (key) {
    // TODO convert data based on attr data type
    nest[attributes[resource.type.id][key].attr.name] = row[key];
  });

  if (resource.relationships) {
    Object.keys(resource.relationships).forEach(function (key) {
      var rel = getTypRelFromResourceRel(resource.type, resource.relationships[key].type.name);
      if (rel.mete && rel.meta.toMany === true) {
        walkForRow(row, attributes, resource.relationships[key], nest[key][0]);
      } else {
        nest[key] = {};
        walkForRow(row, attributes, resource.relationships[key], nest[key]);
      }
    });
  }
}

function getTypRelFromResourceRel(type, name) {
  var i = 0;
  var length = type.relationshipsReference.length;
  while (i < length) {
    if (type.relationshipsReference[i].type === name) {
      return type.relationshipsReference[i];
    }
    i += 1;
  }
}






// ----- Query object Builder ----------------


function CreateQueryObject(structure, id) {
  var joins = [];
  var attributes = {};
  var addedTypes = {};
  addedTypes[structure.parentType.id] = true;
  var parentTable = {
    id: structure.parentType.id,
    table: structure.parentType.table,
    tableAlias: structure.parentType.tableAlias
  };
  addAttributes(structure.parentType);
  buildRelationships(structure.parentType);


  return {
    query: buildQuery(),
    structure: structure,
    attributes: attributes
  };



  function buildQuery() {
    var str = 'select ';
    str += Object.keys(attributes).map(function (idKey) {
      return Object.keys(attributes[idKey]).reduce(function (a, key) {
        var obj = attributes[idKey][key];
        return a + ',' + obj.tableAlias+'.'+obj.attr.field+' as '+key;
      }, '').slice(1);
    }).join(',');
    str += '\nfrom ' + parentTable.table + ' ' + parentTable.tableAlias + '\n';
    str += joins.join('\n');

    return str;
  }


  function buildRelationships(parent) {
    if (!parent.relationships || !parent.relationships.length) { return; }
    parent.relationships.forEach(function (relType) {
      if (addedTypes[relType.id] === true) { return; }
      addedTypes[relType.id] = true;
      addAttributes(relType);
      addJoins(parent, relType);
      buildRelationships(relType);
    });
  }

  function addJoins(parent, relType) {
    var relationship = getRelationship(parent, relType);
    var parentTableAlias = parent.tableAlias;
    var childTableAlias = relType.tableAlias;
    var relTableAlias = relType.prefix + relationship.table;

    if (relationship.manyToMany === true) {
      joins.push('left join ' + relationship.table + ' '+ relTableAlias + ' on ' + relTableAlias+'.'+relationship.field + ' = ' + parentTableAlias+'.'+relType.idField);
      joins.push('left join ' + relType.table + ' ' + childTableAlias + ' on ' + childTableAlias+'.'+relType.idField+ ' = ' + relTableAlias+'.'+relationship.relationField);
    } else if (relationship.oneToMany === true) {
      // TODO check if this is corect
      joins.push('left join ' + relationship.table + ' '+ relTableAlias + ' on ' + relTableAlias+'.'+relationship.field + ' = ' + childTableAlias+'.'+reltype.idField);
    } else {
      // TODO check if this is corect
      joins.push('left join ' + relationship.table + ' '+ relTableAlias + ' on ' + relTableAlias+'.'+relType.idField + ' = ' + childTableAlias+'.'+relationship.field);
    }
  }



  function getRelationship(parent, relType) {
    var i = 0;
    var length = parent.relationshipsReference.length;
    while (i < length) {
      if (parent.relationshipsReference[i].type === relType.name) {
        return parent.relationshipsReference[i];
      }
      i += 1;
    }
  }


  function addAttributes(type) {
    attributes[type.id] = {};
    type.attributes.forEach(function (attr) {
      attributes[type.id][type.prefix+attr.name] = {
        table: type.table,
        tableAlias: type.prefix+type.table,
        attr: attr
      };
    });

    attributes[type.id][type.prefix+type.uuidField.name] = {
      table: type.table,
      tableAlias: type.prefix+type.table,
      attr: type.uuidField
    };
  }
}