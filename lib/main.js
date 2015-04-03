define(["config", "moment", "router", "leaflet", "gui", "numeral"],
function (config, moment, Router, L, GUI, numeral) {
  return function () {
    function handleData(data) {
      var nodes = Object.keys(data[0].nodes).map(function (key) { return data[0].nodes[key] })

      nodes = nodes.filter( function (d) {
        return "firstseen" in d && "lastseen" in d
      })

      nodes.forEach( function(node) {
        node.firstseen = moment.utc(node.firstseen).local()
        node.lastseen = moment.utc(node.lastseen).local()
      })

      var now = moment()
      var age = moment(now).subtract(14, "days")

      var newnodes = limit("firstseen", age, sortByKey("firstseen", nodes).filter(online))
      var lostnodes = limit("lastseen", age, sortByKey("lastseen", nodes).filter(offline))

      var graph = data[1].batadv
      var graphnodes = data[0].nodes

      graph.nodes.forEach( function (d) {
        if (d.node_id in graphnodes)
          d.node = graphnodes[d.node_id]
      })

      graph.links.forEach( function (d) {
        if (graph.nodes[d.source].node)
          d.source = graph.nodes[d.source]
        else
          d.source = undefined

        if (graph.nodes[d.target].node)
          d.target = graph.nodes[d.target]
        else
          d.target = undefined
      })

      var links = graph.links.filter( function (d) {
        return d.source !== undefined && d.target !== undefined
      })

      links.forEach( function (d) {
        if (!("location" in d.source.node.nodeinfo && "location" in d.target.node.nodeinfo))
          return

        d.latlngs = []
        d.latlngs.push(L.latLng(d.source.node.nodeinfo.location.latitude, d.source.node.nodeinfo.location.longitude))
        d.latlngs.push(L.latLng(d.target.node.nodeinfo.location.latitude, d.target.node.nodeinfo.location.longitude))

        d.distance = d.latlngs[0].distanceTo(d.latlngs[1])
      })

      nodes.forEach( function (d) {
        d.neighbours = []
      })

      links.forEach( function (d) {
        d.source.node.neighbours.push({ node: d.target.node, link: d })
        d.target.node.neighbours.push({ node: d.source.node, link: d })
      })

      return { now: now,
               timestamp: moment.utc(data[0].timestamp).local(),
               nodes: {
                 all: nodes,
                 new: newnodes,
                 lost: lostnodes
               },
               graph: {
                 links: links,
                 nodes: graph.nodes
               }
             }
    }

    numeral.language("de")
    moment.locale("de")

    var router = new Router()

    var urls = [ config.dataPath + "nodes.json",
                 config.dataPath + "graph.json"
               ]
    function update() {
      return Promise.all(urls.map(getJSON))
      .then(function (d) {
        var nodes = Object.keys(d[0].nodes).map(function (a) { return d[0].nodes[a] })
        .filter(function () { return Math.random() > .10 })

        d[0].nodes = {}

        nodes.forEach(function (a) {
          d[0].nodes[a.nodeinfo.node_id] = a
        })


        return d
      })
      .then(handleData)
    }

    update()
      .then(function (d) {
        var gui = new GUI(config, router)
        gui.setData(d)
        router.setData(d)
        router.start()

        window.setInterval(function () {
          update().then(function (d) {
            gui.setData(d)
            router.setData(d)
          })
        }, 1000)
      })
      .catch(function (e) {
        console.log(e)
      })
  }
})
