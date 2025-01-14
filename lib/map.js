define(["map/clientlayer", "map/labelslayer",
        "d3", "leaflet", "moment", "locationmarker", "rbush",
        "leaflet.label", "leaflet.providers"],
  function (ClientLayer, LabelsLayer, d3, L, moment, LocationMarker, rbush) {
    var options = { worldCopyJump: true,
                    zoomControl: false
                  }

    var AddLayerButton = L.Control.extend({
        options: {
          position: "bottomright"
        },

        initialize: function (f, options) {
          L.Util.setOptions(this, options)
          this.f = f
        },

        onAdd: function () {
          var button = L.DomUtil.create("button", "add-layer")

          L.DomEvent.disableClickPropagation(button)
          L.DomEvent.addListener(button, "click", this.f, this)

          this.button = button

          return button
        }
    })

    var LocateButton = L.Control.extend({
        options: {
          position: "bottomright"
        },

        active: false,
        button: undefined,

        initialize: function (f, options) {
          L.Util.setOptions(this, options)
          this.f = f
        },

        onAdd: function () {
          var button = L.DomUtil.create("button", "locate-user")

          L.DomEvent.disableClickPropagation(button)
          L.DomEvent.addListener(button, "click", this.onClick, this)

          this.button = button

          return button
        },

        update: function() {
          this.button.classList.toggle("active", this.active)
        },

        set: function(v) {
          this.active = v
          this.update()
        },

        onClick: function () {
          this.f(!this.active)
        }
    })

    function mkMarker(dict, iconFunc, router) {
      return function (d) {
        var m = L.circleMarker([d.nodeinfo.location.latitude, d.nodeinfo.location.longitude], iconFunc(d))

        m.resetStyle = function () {
          m.setStyle(iconFunc(d))
        }

        m.on("click", router.node(d))
        m.bindLabel(d.nodeinfo.hostname)

        dict[d.nodeinfo.node_id] = m

        return m
      }
    }

    function addLinksToMap(dict, linkScale, graph, router) {
      graph = graph.filter( function (d) {
        return "distance" in d && !d.vpn
      })

      var lines = graph.map( function (d) {
        var opts = { color: linkScale(d.tq).hex(),
                     weight: 4,
                     opacity: 0.5,
                     dashArray: "none"
                   }

        var line = L.polyline(d.latlngs, opts)

        line.resetStyle = function () {
          line.setStyle(opts)
        }

        line.bindLabel(d.source.node.nodeinfo.hostname + " – " + d.target.node.nodeinfo.hostname + "<br><strong>" + showDistance(d) + " / " + showTq(d) + "</strong>")
        line.on("click", router.link(d))

        dict[d.id] = line

        return line
      })

      return lines
    }

    var iconOnline  = { color: "#1566A9", fillColor: "#1566A9", radius: 6, fillOpacity: 0.5, opacity: 0.5, weight: 2, className: "stroke-first" }
    var iconOffline = { color: "#D43E2A", fillColor: "#D43E2A", radius: 3, fillOpacity: 0.5, opacity: 0.5, weight: 1, className: "stroke-first" }
    var iconLost    = { color: "#D43E2A", fillColor: "#D43E2A", radius: 6, fillOpacity: 0.8, opacity: 0.8, weight: 1, className: "stroke-first" }
    var iconAlert   = { color: "#D43E2A", fillColor: "#D43E2A", radius: 6, fillOpacity: 0.8, opacity: 0.8, weight: 2, className: "stroke-first node-alert" }
    var iconNew     = { color: "#1566A9", fillColor: "#93E929", radius: 6, fillOpacity: 1.0, opacity: 0.5, weight: 2 }

    return function (config, linkScale, sidebar, router) {
      var self = this
      var barycenter
      var groupOnline, groupOffline, groupNew, groupLost, groupLines
      var savedView

      var map, userLocation
      var layerControl
      var customLayers = new Set()

      var locateUserButton = new LocateButton(function (d) {
        if (d)
          enableTracking()
        else
          disableTracking()
      })

      function saveView() {
        savedView = {center: map.getCenter(),
                     zoom: map.getZoom()}
      }

      function enableTracking() {
        map.locate({watch: true,
                    enableHighAccuracy: true,
                    setView: true
                   })
        locateUserButton.set(true)
      }

      function disableTracking() {
        map.stopLocate()
        locationError()
        locateUserButton.set(false)
      }

      function locationFound(e) {
        if (!userLocation)
          userLocation = new LocationMarker(e.latlng).addTo(map)

        userLocation.setLatLng(e.latlng)
        userLocation.setAccuracy(e.accuracy)
      }

      function locationError() {
        if (userLocation) {
          map.removeLayer(userLocation)
          userLocation = null
        }
      }

      function addLayer(layerName) {
        if (customLayers.has(layerName))
          return

        try {
          var layer = L.tileLayer.provider(layerName)
          layerControl.addBaseLayer(layer, layerName)
          customLayers.add(layerName)

          if (!layerControl.added) {
            layerControl.addTo(map)
            layerControl.added = true
          }

          if (localStorageTest())
            localStorage.setItem("map/customLayers", JSON.stringify(Array.from(customLayers)))
        } catch (e) {
          return
        }
      }

      function contextMenuGotoLocation(e) {
        console.log("context menu called at ",e);
        router.gotoLocation(e.latlng);
      }

      var el = document.createElement("div")
      el.classList.add("map")
      self.div = el

      map = L.map(el, options)

      var baseLayer = L.tileLayer("https://otile{s}-s.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.jpg", {
                                    subdomains: "1234",
                                    type: "osm",
                                    attribution: "Tiles &copy; <a href=\"https://www.mapquest.com/\" target=\"_blank\">MapQuest</a>, Data CC-BY-SA OpenStreetMap",
                                    maxZoom: 18
                                  }).addTo(map)

      map.on("locationfound", locationFound)
      map.on("locationerror", locationError)
      map.on("dragend", saveView)
      map.on("contextmenu", contextMenuGotoLocation)

      map.addControl(locateUserButton)

      map.addControl(new AddLayerButton(function () {
        /*eslint no-alert:0*/
        var layerName = prompt("Leaflet Provider:")
        addLayer(layerName)
      }))

      layerControl = L.control.layers({"MapQuest": baseLayer}, [], {position: "bottomright"})

      if (localStorageTest()) {
        var layers = JSON.parse(localStorage.getItem("map/customLayers"))

        if (layers)
          layers.forEach(addLayer)
      }

      var clientLayer = new ClientLayer({minZoom: 15})
      clientLayer.addTo(map)
      clientLayer.setZIndex(5)

      var labelsLayer = new LabelsLayer()
      labelsLayer.addTo(map)
      labelsLayer.setZIndex(6)

      var nodeDict = {}
      var linkDict = {}
      var highlight

      function resetMarkerStyles(nodes, links) {
        Object.keys(nodes).forEach( function (d) {
          nodes[d].resetStyle()
        })

        Object.keys(links).forEach( function (d) {
          links[d].resetStyle()
        })
      }

      function setView(bounds) {
        map.fitBounds(bounds, {paddingTopLeft: [sidebar.getWidth(), 0]})
      }

      function resetZoom() {
        setView(barycenter.getBounds())
      }

      function goto(m) {
        var bounds

        if ("getBounds" in m)
          bounds = m.getBounds()
        else
          bounds = L.latLngBounds([m.getLatLng()])

        setView(bounds)

        return m
      }

      function updateView(nopanzoom) {
        resetMarkerStyles(nodeDict, linkDict)
        var m

        if (highlight !== undefined)
          if (highlight.type === "node") {
            m = nodeDict[highlight.o.nodeinfo.node_id]

            if (m)
              m.setStyle({ color: "orange", weight: 20, fillOpacity: 1, opacity: 0.7, className: "stroke-first" })
          } else if (highlight.type === "link") {
            m = linkDict[highlight.o.id]

            if (m)
              m.setStyle({ weight: 7, opacity: 1, dashArray: "10, 10" })
          }

        if (!nopanzoom)
          if (m)
            goto(m)
          else if (savedView)
            map.setView(savedView.center, savedView.zoom)
          else
            resetZoom()
      }

      function calcBarycenter(nodes) {
        nodes = nodes.map(function (d) { return d.nodeinfo.location })
        var lats = nodes.map(function (d) { return d.latitude })
        var lngs = nodes.map(function (d) { return d.longitude })

        var barycenter = L.latLng(d3.median(lats), d3.median(lngs))
        var barycenterDev = [d3.deviation(lats), d3.deviation(lngs)]

        var barycenterCircle = L.latLng(barycenter.lat + barycenterDev[0],
                                        barycenter.lng + barycenterDev[1])

        var r = barycenter.distanceTo(barycenterCircle)

        return L.circle(barycenter, r * config.mapSigmaScale)
      }

      function mapRTree(d) {
        var o = [ d.nodeinfo.location.latitude, d.nodeinfo.location.longitude,
                  d.nodeinfo.location.latitude, d.nodeinfo.location.longitude]

        o.node = d

        return o
      }

      self.setData = function (data) {
        nodeDict = {}
        linkDict = {}

        if (groupOffline)
          groupOffline.clearLayers()

        if (groupOnline)
          groupOnline.clearLayers()

        if (groupNew)
          groupNew.clearLayers()

        if (groupLost)
          groupLost.clearLayers()

        if (groupLines)
          groupLines.clearLayers()

        var lines = addLinksToMap(linkDict, linkScale, data.graph.links, router)
        groupLines = L.featureGroup(lines).addTo(map)

        barycenter = calcBarycenter(data.nodes.all.filter(has_location))

        var nodesOnline = subtract(data.nodes.all.filter(online), data.nodes.new)
        var nodesOffline = subtract(data.nodes.all.filter(offline), data.nodes.lost)

        var markersOnline = nodesOnline.filter(has_location)
          .map(mkMarker(nodeDict, function () { return iconOnline }, router))

        var markersOffline = nodesOffline.filter(has_location)
          .map(mkMarker(nodeDict, function () { return iconOffline }, router))

        var markersNew = data.nodes.new.filter(has_location)
          .map(mkMarker(nodeDict, function () { return iconNew }, router))

        var markersLost = data.nodes.lost.filter(has_location)
          .map(mkMarker(nodeDict, function (d) {
            if (d.lastseen.isAfter(moment(data.now).subtract(3, "days")))
              return iconAlert

            return iconLost
          }, router))

        groupOffline = L.featureGroup(markersOffline).addTo(map)
        groupOnline = L.featureGroup(markersOnline).addTo(map)
        groupLost = L.featureGroup(markersLost).addTo(map)
        groupNew = L.featureGroup(markersNew).addTo(map)

        var rtreeOnlineAll = rbush(9)

        rtreeOnlineAll.load(data.nodes.all.filter(online).filter(has_location).map(mapRTree))

        clientLayer.setData(rtreeOnlineAll)
        labelsLayer.setData({online: nodesOnline.filter(has_location),
                             offline: nodesOffline.filter(has_location),
                             new: data.nodes.new.filter(has_location),
                             lost: data.nodes.lost.filter(has_location)
                            })

        updateView(true)
      }

      self.resetView = function () {
        disableTracking()
        highlight = undefined
        updateView()
      }

      self.gotoNode = function (d) {
        disableTracking()
        highlight = {type: "node", o: d}
        updateView()
      }

      self.gotoLink = function (d) {
        disableTracking()
        highlight = {type: "link", o: d}
        updateView()
      }

      self.gotoLocation = function (d) {
        //ignore
      }

      self.destroy = function () {
        map.remove()
      }

      return self
    }
})
