const VerifyPage = () => {
  return (
    <div style={{ color: "white", textAlign: "center", marginTop: "50px" }}>
      <h2>Verify Certificate</h2>
      <p>
        Upload a certificate file or paste a verification link to check
        authenticity.
      </p>

      <div style={{ marginTop: "30px" }}>
        <input type="file" />
        <br /><br />
        <button>Verify</button>
      </div>
    </div>
  );
};

export default VerifyPage;
