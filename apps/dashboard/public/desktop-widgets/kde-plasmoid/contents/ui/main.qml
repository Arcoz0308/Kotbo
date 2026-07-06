import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.components as PlasmaComponents3

PlasmoidItem {
    id: root

    readonly property string token: Plasmoid.configuration.token
    readonly property string apiBase: Plasmoid.configuration.apiBase || "https://kotbo.fr"
    readonly property int refreshMinutes: Plasmoid.configuration.refreshMinutes || 15

    property var stats: null
    property string errorText: ""

    preferredRepresentation: fullRepresentation

    compactRepresentation: PlasmaComponents3.Label {
        anchors.centerIn: parent
        text: stats ? ("lvl " + stats.user.level + " · " + stats.user.staffScore + " pts") : "Kotbo"
        font.pixelSize: Math.max(10, Math.min(parent.width, parent.height) * 0.4)
    }

    fullRepresentation: Item {
        Layout.preferredWidth: 320
        Layout.preferredHeight: 220

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 12
            spacing: 8

            RowLayout {
                Layout.fillWidth: true

                PlasmaComponents3.Label {
                    text: stats ? stats.server.name : "Kotbo"
                    font.bold: true
                    font.pointSize: 12
                    Layout.fillWidth: true
                    elide: Text.ElideRight
                }
                PlasmaComponents3.ToolButton {
                    icon.name: "view-refresh"
                    onClicked: root.refresh()
                }
            }

            PlasmaComponents3.Label {
                visible: !token
                text: "Configure ton token dans les paramètres du widget (clic droit → Configurer…)."
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            PlasmaComponents3.Label {
                visible: !!token && errorText.length > 0
                text: errorText
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            GridLayout {
                visible: stats !== null
                columns: 2
                columnSpacing: 16
                rowSpacing: 6
                Layout.fillWidth: true

                PlasmaComponents3.Label { text: "Rang"; opacity: 0.7 }
                PlasmaComponents3.Label { text: stats ? stats.user.staffRank : "" }

                PlasmaComponents3.Label { text: "Niveau"; opacity: 0.7 }
                PlasmaComponents3.Label { text: stats ? stats.user.level : "" }

                PlasmaComponents3.Label { text: "Messages"; opacity: 0.7 }
                PlasmaComponents3.Label { text: stats ? stats.user.messageCount : "" }

                PlasmaComponents3.Label { text: "Vocal"; opacity: 0.7 }
                PlasmaComponents3.Label { text: stats ? (stats.user.voiceMinutes + " min") : "" }

                PlasmaComponents3.Label { text: "Staff score"; opacity: 0.7 }
                PlasmaComponents3.Label { text: stats ? stats.user.staffScore : "" }
            }

            Item { Layout.fillHeight: true }

            PlasmaComponents3.Label {
                visible: stats !== null
                text: stats ? ("Mis à jour à " + new Date(stats.updatedAt).toLocaleTimeString(Qt.locale())) : ""
                opacity: 0.6
                font.pointSize: 8
            }
        }
    }

    function refresh() {
        if (!token) return;
        errorText = "";
        var xhr = new XMLHttpRequest();
        var url = apiBase.replace(/\/$/, "") + "/api/public/widget-data?token=" + encodeURIComponent(token);
        xhr.open("GET", url);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    try {
                        stats = JSON.parse(xhr.responseText);
                    } catch (e) {
                        errorText = "Réponse invalide de l'API";
                    }
                } else {
                    errorText = "Erreur API (" + xhr.status + ")";
                }
            }
        };
        xhr.send();
    }

    Timer {
        interval: refreshMinutes * 60 * 1000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.refresh()
    }
}
