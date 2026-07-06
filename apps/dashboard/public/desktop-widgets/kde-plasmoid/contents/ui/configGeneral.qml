import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts

QQC2.ScrollView {
    id: page

    property alias cfg_token: tokenField.text
    property alias cfg_apiBase: apiBaseField.text
    property alias cfg_refreshMinutes: refreshSpin.value

    ColumnLayout {
        width: page.availableWidth
        spacing: 12

        QQC2.Label {
            text: "Token widget Kotbo (page Widget du dashboard, section « Widgets téléphone & PC »)"
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
        }
        QQC2.TextField {
            id: tokenField
            Layout.fillWidth: true
            echoMode: TextInput.Password
            placeholderText: "wgt_..."
        }

        QQC2.Label {
            text: "URL de l'API (celle de ton dashboard, sans slash final)"
        }
        QQC2.TextField {
            id: apiBaseField
            Layout.fillWidth: true
            placeholderText: "https://kotbo.fr"
        }

        QQC2.Label {
            text: "Rafraîchissement (minutes)"
        }
        QQC2.SpinBox {
            id: refreshSpin
            from: 5
            to: 180
        }
    }
}
