import sys
import json
import predictor

def main():
    # Signal that the worker is ready
    print(json.dumps({"status": "ready"}), flush=True)

    for line in sys.stdin:
        try:
            data = json.loads(line.strip())
            
            heart_rate = data.get('heart_rate')
            spo2 = data.get('spo2')
            temperature = data.get('temperature')
            medex = data.get('medex')
            
            if None in [heart_rate, spo2, temperature, medex]:
                print(json.dumps({"error": "Missing required fields"}), flush=True)
                continue
                
            result = predictor.predict_patient(
                heart_rate=float(heart_rate),
                spo2=float(spo2),
                temperature=float(temperature),
                medex=float(medex)
            )
            
            # Print the result back to Node.js
            print(json.dumps(result), flush=True)
            
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == '__main__':
    main()
